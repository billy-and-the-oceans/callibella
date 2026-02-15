use super::audio_types::{AudioModelStatus, AudioStage, VoiceInfo};

use base64::Engine as _;
use kokorox::tts::koko::TTSKoko;
use sha2::{Digest, Sha256};

use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("TTS model not loaded — call preload_model first")]
    ModelNotLoaded,

    #[error("TTS generation failed: {0}")]
    GenerationFailed(String),

    #[error("Generation cancelled")]
    Cancelled,

    #[error("Cache I/O error: {0}")]
    CacheIo(String),

    #[error("WAV encoding error: {0}")]
    WavEncode(String),
}

/// Kokoro-82M TTS engine backed by kokorox + ort 2.0.
/// Model and voice data are downloaded from HuggingFace on first load.
pub struct KokoroEngine {
    tts: Option<TTSKoko>,
}

impl KokoroEngine {
    pub fn new() -> Self {
        Self { tts: None }
    }

    /// Download (if needed) and load the Kokoro ONNX model + voice data.
    /// This may take a moment on first run (~350MB download).
    pub async fn load_model(&mut self) -> Result<(), AudioError> {
        if self.tts.is_some() {
            return Ok(());
        }
        // TTSKoko::new with None paths triggers HuggingFace Hub download
        // to the default cache directory (~/.cache/huggingface/)
        let tts = TTSKoko::new(None, None).await;
        self.tts = Some(tts);
        Ok(())
    }

    pub fn is_loaded(&self) -> bool {
        self.tts.is_some()
    }

    /// Generate speech audio from text. Returns f32 PCM samples at 24kHz.
    pub fn generate(
        &self,
        text: &str,
        voice_id: &str,
        speed: f32,
        language: &str,
    ) -> Result<Vec<f32>, AudioError> {
        let tts = self.tts.as_ref().ok_or(AudioError::ModelNotLoaded)?;

        // Map language codes to kokorox language identifiers
        let lan = match language {
            "ja" | "jp" => "ja",
            "zh" | "cn" => "zh",
            "en" | "en-us" | "en-gb" => "en-us",
            "fr" => "fr-fr",
            "es" => "es",
            "de" => "de",
            "it" => "it",
            "pt" => "pt-br",
            "ko" => "ko",
            other => other,
        };

        let samples = tts
            .tts_raw_audio(
                text,
                lan,
                voice_id,
                speed,
                None,  // initial_silence
                true,  // auto_detect_language
                false, // force_style
                false, // phonemes input
            )
            .map_err(|e| AudioError::GenerationFailed(e.to_string()))?;

        Ok(samples)
    }

    pub fn sample_rate(&self) -> u32 {
        24000
    }

    pub fn status(&self) -> AudioModelStatus {
        AudioModelStatus {
            downloaded: self.tts.is_some(),
            loading: false,
            ready: self.tts.is_some(),
            model_size_bytes: if self.tts.is_some() { Some(350_000_000) } else { None },
            error: None,
        }
    }

    /// Pick a default voice appropriate for the given language code.
    /// Kokoro voice IDs encode language in their prefix:
    ///   af_ = American English Female, am_ = American English Male
    ///   bf_ = British English Female,  bm_ = British English Male
    ///   ff_ = French Female,           jf_ = Japanese Female, etc.
    pub fn default_voice_for_language(language: &str) -> &'static str {
        match language {
            "fr" => "ff_siwis",
            "ja" | "jp" => "jf_alpha",
            "zh" | "cn" => "zf_xiaobei",
            "ko" => "af_bella",        // No native Korean voices yet — fallback
            "es" => "ef_dora",
            "de" => "af_bella",        // No native German voices yet — fallback
            "it" => "if_sara",
            "pt" => "pf_dora",
            "hi" => "hf_alpha",
            "en" | "en-us" => "af_bella",
            "en-gb" => "bf_emma",
            _ => "af_bella",
        }
    }

    pub fn available_voices(&self) -> Vec<VoiceInfo> {
        vec![
            // English (American)
            VoiceInfo { id: "af_bella".into(), name: "Bella (F, EN-US)".into(), language: "en".into(), sample_url: None },
            VoiceInfo { id: "af_sarah".into(), name: "Sarah (F, EN-US)".into(), language: "en".into(), sample_url: None },
            VoiceInfo { id: "am_adam".into(), name: "Adam (M, EN-US)".into(), language: "en".into(), sample_url: None },
            // English (British)
            VoiceInfo { id: "bf_emma".into(), name: "Emma (F, EN-GB)".into(), language: "en-gb".into(), sample_url: None },
            VoiceInfo { id: "bm_george".into(), name: "George (M, EN-GB)".into(), language: "en-gb".into(), sample_url: None },
            // French
            VoiceInfo { id: "ff_siwis".into(), name: "Siwis (F, FR)".into(), language: "fr".into(), sample_url: None },
            // Japanese
            VoiceInfo { id: "jf_alpha".into(), name: "Alpha (F, JA)".into(), language: "ja".into(), sample_url: None },
            VoiceInfo { id: "jm_kumo".into(), name: "Kumo (M, JA)".into(), language: "ja".into(), sample_url: None },
            // Chinese
            VoiceInfo { id: "zf_xiaobei".into(), name: "Xiaobei (F, ZH)".into(), language: "zh".into(), sample_url: None },
            VoiceInfo { id: "zm_yunxi".into(), name: "Yunxi (M, ZH)".into(), language: "zh".into(), sample_url: None },
            // Spanish
            VoiceInfo { id: "ef_dora".into(), name: "Dora (F, ES)".into(), language: "es".into(), sample_url: None },
            // Italian
            VoiceInfo { id: "if_sara".into(), name: "Sara (F, IT)".into(), language: "it".into(), sample_url: None },
            VoiceInfo { id: "im_nicola".into(), name: "Nicola (M, IT)".into(), language: "it".into(), sample_url: None },
            // Portuguese
            VoiceInfo { id: "pf_dora".into(), name: "Dora (F, PT)".into(), language: "pt".into(), sample_url: None },
            // Hindi
            VoiceInfo { id: "hf_alpha".into(), name: "Alpha (F, HI)".into(), language: "hi".into(), sample_url: None },
        ]
    }
}

/// Disk-based WAV cache keyed by SHA256 of "{text}:{voiceId}:{speed}".
pub struct AudioCache {
    cache_dir: PathBuf,
}

impl AudioCache {
    pub fn new(app_data_dir: &Path) -> Result<Self, AudioError> {
        let cache_dir = app_data_dir.join("audio_cache");
        fs::create_dir_all(&cache_dir).map_err(|e| AudioError::CacheIo(e.to_string()))?;
        Ok(Self { cache_dir })
    }

    fn cache_key(text: &str, voice_id: &str, speed: f32) -> String {
        let mut hasher = Sha256::new();
        hasher.update(format!("{}:{}:{}", text, voice_id, speed));
        format!("{:x}", hasher.finalize())
    }

    fn cache_path(&self, key: &str) -> PathBuf {
        self.cache_dir.join(format!("{}.wav", key))
    }

    /// Look up cached WAV and return as base64 if found.
    pub fn get(&self, text: &str, voice_id: &str, speed: f32) -> Option<CachedAudio> {
        let key = Self::cache_key(text, voice_id, speed);
        let path = self.cache_path(&key);
        if path.exists() {
            match fs::read(&path) {
                Ok(bytes) => {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    // Parse WAV header to get duration info
                    let (duration_ms, sample_rate) = wav_info(&bytes).unwrap_or((0, 24000));
                    Some(CachedAudio {
                        audio_base64: b64,
                        duration_ms,
                        sample_rate,
                    })
                }
                Err(_) => None,
            }
        } else {
            None
        }
    }

    /// Write PCM f32 samples as WAV to cache and return base64.
    pub fn put(
        &self,
        text: &str,
        voice_id: &str,
        speed: f32,
        samples: &[f32],
        sample_rate: u32,
    ) -> Result<CachedAudio, AudioError> {
        let key = Self::cache_key(text, voice_id, speed);
        let path = self.cache_path(&key);

        let wav_bytes =
            encode_wav(samples, sample_rate).map_err(|e| AudioError::WavEncode(e.to_string()))?;

        fs::write(&path, &wav_bytes).map_err(|e| AudioError::CacheIo(e.to_string()))?;

        let duration_ms = (samples.len() as u64 * 1000) / sample_rate as u64;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

        Ok(CachedAudio {
            audio_base64: b64,
            duration_ms,
            sample_rate,
        })
    }

    /// Calculate total cache size and entry count.
    pub fn stats(&self) -> (f64, u32) {
        let mut total_bytes: u64 = 0;
        let mut count: u32 = 0;
        if let Ok(entries) = fs::read_dir(&self.cache_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        total_bytes += meta.len();
                        count += 1;
                    }
                }
            }
        }
        let size_mb = total_bytes as f64 / (1024.0 * 1024.0);
        (size_mb, count)
    }
}

pub struct CachedAudio {
    pub audio_base64: String,
    pub duration_ms: u64,
    pub sample_rate: u32,
}

/// The top-level function that orchestrates speech generation.
/// Checks cache first, then generates via engine, then caches result.
pub fn generate_speech(
    engine: &KokoroEngine,
    cache: &AudioCache,
    text: &str,
    voice_id: &str,
    speed: f32,
    language: &str,
    cancelled: &Arc<AtomicBool>,
    mut on_progress: impl FnMut(AudioStage, &str),
) -> Result<CachedAudio, AudioError> {
    // Check cancellation
    if cancelled.load(Ordering::Relaxed) {
        return Err(AudioError::Cancelled);
    }

    // Check cache
    if let Some(cached) = cache.get(text, voice_id, speed) {
        on_progress(AudioStage::CacheHit, "Found in cache");
        return Ok(cached);
    }

    // Check model is loaded
    if !engine.is_loaded() {
        return Err(AudioError::ModelNotLoaded);
    }

    if cancelled.load(Ordering::Relaxed) {
        return Err(AudioError::Cancelled);
    }

    on_progress(AudioStage::Generating, "Generating speech...");
    let samples = engine.generate(text, voice_id, speed, language)?;

    if cancelled.load(Ordering::Relaxed) {
        return Err(AudioError::Cancelled);
    }

    on_progress(AudioStage::Encoding, "Encoding audio...");
    let result = cache.put(text, voice_id, speed, &samples, engine.sample_rate())?;

    Ok(result)
}

/// Encode f32 PCM samples as WAV bytes.
fn encode_wav(samples: &[f32], sample_rate: u32) -> Result<Vec<u8>, hound::Error> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)?;
        for &sample in samples {
            let clamped = sample.clamp(-1.0, 1.0);
            let int_sample = (clamped * i16::MAX as f32) as i16;
            writer.write_sample(int_sample)?;
        }
        writer.finalize()?;
    }

    Ok(cursor.into_inner())
}

/// Parse WAV header to extract duration and sample rate.
fn wav_info(bytes: &[u8]) -> Option<(u64, u32)> {
    let cursor = Cursor::new(bytes);
    let reader = hound::WavReader::new(cursor).ok()?;
    let spec = reader.spec();
    let num_samples = reader.len() as u64;
    let duration_ms = (num_samples * 1000) / spec.sample_rate as u64;
    Some((duration_ms, spec.sample_rate))
}
