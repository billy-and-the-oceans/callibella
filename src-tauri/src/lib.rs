mod boka;

use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Instant;
use std::time::{SystemTime, UNIX_EPOCH};

use boka::audio::{generate_speech, AudioCache, KokoroEngine};
use boka::audio_types::{AudioErrorEvent, AudioModelStatus, AudioProgressEvent, AudioResponse};
use boka::gui_types::InteractiveDoc;
use boka::translation::{run_translation, TranslationArgs};
use boka::types::{ApiConfig, LlmProviderConfig, LlmProviderPreset};

use serde::Serialize;
use tauri::async_runtime::Mutex;
use tauri::{Emitter, Manager};

#[derive(Default)]
struct TranslationState {
    cancelled_by_job: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationDocEvent {
    job_id: String,
    doc: InteractiveDoc,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationErrorEvent {
    job_id: String,
    message: String,
}

struct AudioState {
    engine: Arc<Mutex<KokoroEngine>>,
    cache: Arc<Mutex<Option<AudioCache>>>,
    cancelled_by_request: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            engine: Arc::new(Mutex::new(KokoroEngine::new())),
            cache: Arc::new(Mutex::new(None)),
            cancelled_by_request: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
#[allow(unused_variables)]
async fn boka_generate_speech(
    app: tauri::AppHandle,
    state: tauri::State<'_, AudioState>,
    text: String,
    language: String,
    voice_id: Option<String>,
    speed: Option<f32>,
) -> Result<String, String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let request_id = format!("audio-{}", ts);

    let cancelled = Arc::new(AtomicBool::new(false));
    state
        .cancelled_by_request
        .lock()
        .await
        .insert(request_id.clone(), cancelled.clone());

    // Initialize cache lazily using app data dir
    {
        let mut cache_guard = state.cache.lock().await;
        if cache_guard.is_none() {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?;
            match AudioCache::new(&app_data_dir) {
                Ok(c) => *cache_guard = Some(c),
                Err(e) => return Err(e.to_string()),
            }
        }
    }

    let engine = state.engine.clone();
    let cache = state.cache.clone();
    let cancelled_map = state.cancelled_by_request.clone();
    let rid = request_id.clone();
    let voice = voice_id.unwrap_or_else(|| {
        KokoroEngine::default_voice_for_language(&language).to_string()
    });
    let spd = speed.unwrap_or(1.0);

    let lang = language;

    tauri::async_runtime::spawn(async move {
        let app_handle = app.clone();
        let rid_for_progress = rid.clone();

        let engine_guard = engine.lock().await;
        let cache_guard = cache.lock().await;
        let cache_ref = match cache_guard.as_ref() {
            Some(c) => c,
            None => {
                let _ = app_handle.emit(
                    "boka:audio:error",
                    AudioErrorEvent {
                        request_id: rid.clone(),
                        message: "Audio cache not initialized".to_string(),
                    },
                );
                cancelled_map.lock().await.remove(&rid);
                return;
            }
        };

        let result = generate_speech(
            &engine_guard,
            cache_ref,
            &text,
            &voice,
            spd,
            &lang,
            &cancelled,
            |stage, msg| {
                let _ = app_handle.emit(
                    "boka:audio:progress",
                    AudioProgressEvent {
                        request_id: rid_for_progress.clone(),
                        stage,
                        message: msg.to_string(),
                    },
                );
            },
        );

        match result {
            Ok(cached) => {
                let _ = app.emit(
                    "boka:audio:ready",
                    AudioResponse {
                        request_id: rid.clone(),
                        audio_base64: cached.audio_base64,
                        duration_ms: cached.duration_ms,
                        sample_rate: cached.sample_rate,
                    },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "boka:audio:error",
                    AudioErrorEvent {
                        request_id: rid.clone(),
                        message: e.to_string(),
                    },
                );
            }
        }

        cancelled_map.lock().await.remove(&rid);
    });

    Ok(request_id)
}

#[tauri::command]
async fn boka_cancel_audio(
    state: tauri::State<'_, AudioState>,
    request_id: String,
) -> Result<(), String> {
    let guard = state.cancelled_by_request.lock().await;
    if let Some(flag) = guard.get(&request_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
async fn boka_get_audio_status(
    state: tauri::State<'_, AudioState>,
) -> Result<AudioModelStatus, String> {
    let engine = state.engine.lock().await;
    Ok(engine.status())
}

#[tauri::command]
async fn boka_preload_model(
    state: tauri::State<'_, AudioState>,
) -> Result<(), String> {
    let mut engine = state.engine.lock().await;
    engine.load_model().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn boka_test_provider(provider: LlmProviderConfig) -> Result<String, String> {
    let mut cfg = ApiConfig::from_env("fr", None, false, false);
    cfg.provider = provider;

    if matches!(cfg.provider.preset, LlmProviderPreset::Anthropic) {
        if cfg
            .provider
            .api_key
            .as_ref()
            .map(|k| k.trim().is_empty())
            .unwrap_or(true)
        {
            cfg.provider.api_key = std::env::var("ANTHROPIC_API_KEY").ok();
        }
        if cfg
            .provider
            .model
            .as_ref()
            .map(|m| m.trim().is_empty())
            .unwrap_or(true)
        {
            cfg.provider.model = Some("claude-sonnet-4-20250514".to_string());
        }

        let client = boka::anthropic::AnthropicClient::new(cfg).map_err(|e| e.to_string())?;
        let t0 = Instant::now();
        client.test_connection().await.map_err(|e| e.to_string())?;
        let ms = t0.elapsed().as_millis();

        Ok(format!(
            "provider: anthropic\nendpoint: {}\nmodel: {}\nauth: x-api-key (set)\nlatencyMs: {}",
            client.api_url(),
            client.model(),
            ms
        ))
    } else {
        let preset = format!("{:?}", cfg.provider.preset).to_lowercase();
        let client = boka::openai_compat::OpenAiCompatClient::new(cfg).map_err(|e| e.to_string())?;
        let endpoint = client.chat_completions_url();
        let auth = if client.has_api_key() { "bearer (set)" } else { "none" };

        let t0 = Instant::now();
        client.test_connection().await.map_err(|e| e.to_string())?;
        let ms = t0.elapsed().as_millis();

        Ok(format!(
            "provider: {}\nbaseUrl: {}\nendpoint: {}\nmodel: {}\nauth: {}\nlatencyMs: {}",
            preset,
            client.base_url(),
            endpoint,
            client.model(),
            auth,
            ms
        ))
    }
}

#[tauri::command]
async fn boka_start_translation(
    app: tauri::AppHandle,
    state: tauri::State<'_, TranslationState>,
    story_text: String,
    target_language: Option<String>,
    source_language: Option<String>,
    adult_mode: bool,
    dense_spans: bool,
    provider: LlmProviderConfig,
) -> Result<String, String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let job_id = format!("job-{}", ts);

    let cancelled = Arc::new(AtomicBool::new(false));
    state
        .cancelled_by_job
        .lock()
        .await
        .insert(job_id.clone(), cancelled.clone());

    let app_for_task = app.clone();
    let state_for_task = state.cancelled_by_job.clone();
    let job_id_for_task = job_id.clone();
    let lang = target_language.unwrap_or_else(|| "fr".to_string());

    tauri::async_runtime::spawn(async move {
        let app_for_emit = app_for_task.clone();
        let job_id_for_emit = job_id_for_task.clone();
        let app_for_doc_emit = app_for_task.clone();
        let job_id_for_doc_emit = job_id_for_task.clone();

        let on_job = move |job: &boka::gui_types::TranslationJob| {
            let app_for_emit = app_for_emit.clone();
            let payload = job.clone();
            async move {
                let _ = app_for_emit.emit("boka:translation:job", payload);
            }
        };

        let on_doc = move |doc: &boka::gui_types::InteractiveDoc| {
            let app_for_doc_emit = app_for_doc_emit.clone();
            let payload = TranslationDocEvent {
                job_id: job_id_for_doc_emit.clone(),
                doc: doc.clone(),
            };
            async move {
                let _ = app_for_doc_emit.emit("boka:translation:doc", payload);
            }
        };

        let result = run_translation(TranslationArgs {
            story_text,
            job_id: job_id_for_task.clone(),
            target_language: lang,
            source_language,
            adult_mode,
            dense_spans,
            provider,
            cancelled: cancelled.clone(),
            on_job: Box::new(on_job),
            on_doc: Box::new(on_doc),
        })
        .await;

        match result {
            Ok(done) => {
                let _ = app_for_task.emit(
                    "boka:translation:doc",
                    TranslationDocEvent {
                        job_id: job_id_for_task.clone(),
                        doc: done.doc,
                    },
                );
            }
            Err(e) => {
                let _ = app_for_task.emit(
                    "boka:translation:error",
                    TranslationErrorEvent {
                        job_id: job_id_for_emit,
                        message: e.to_string(),
                    },
                );
            }
        }

        state_for_task.lock().await.remove(&job_id_for_task);
    });

    Ok(job_id)
}

#[tauri::command]
async fn boka_cancel_translation(
    state: tauri::State<'_, TranslationState>,
    job_id: String,
) -> Result<(), String> {
    let guard = state.cancelled_by_job.lock().await;
    if let Some(flag) = guard.get(&job_id) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(TranslationState::default())
        .manage(AudioState::default())
        .setup(|app| {
            // Try to load Kokoro model in background on startup.
            // If already downloaded (~/.cache/huggingface/), this is instant.
            // If not downloaded yet, this will silently fail — user clicks DOWNLOAD later.
            let engine = app.state::<AudioState>().engine.clone();
            tauri::async_runtime::spawn(async move {
                let mut guard = engine.lock().await;
                if let Err(e) = guard.load_model().await {
                    eprintln!("[AUDIO] Model not available on startup (expected on first run): {e}");
                } else {
                    println!("[AUDIO] Kokoro model loaded on startup");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            boka_start_translation,
            boka_cancel_translation,
            boka_generate_speech,
            boka_cancel_audio,
            boka_get_audio_status,
            boka_preload_model,
            boka_test_provider,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
