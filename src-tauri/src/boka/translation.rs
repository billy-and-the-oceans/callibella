use super::anthropic::{AnthropicClient, PlannedBlock, PlannedSegment};
use super::gui_types::{DocToken, InteractiveDoc, SegmentStage, Span, TranslationJob, TranslationSegment, Variant};
use super::openai_compat::OpenAiCompatClient;
use super::types::{ApiConfig, ApiError, LlmProviderConfig, LlmProviderPreset};

use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use std::future::Future;
use std::pin::Pin;

pub fn split_into_segments(text: &str) -> Vec<String> {
    let t = text.trim();
    if t.is_empty() {
        return vec![];
    }

    let rough: Vec<String> = t
        .split_inclusive(|c| c == '.' || c == '!' || c == '?')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();

    if !rough.is_empty() {
        return rough;
    }

    vec![t.to_string()]
}

pub struct TranslationResult {
    pub job: TranslationJob,
    pub doc: InteractiveDoc,
}

pub async fn run_translation(args: TranslationArgs) -> Result<TranslationResult, ApiError> {
    let TranslationArgs {
        story_text,
        job_id,
        target_language,
        source_language,
        adult_mode,
        dense_spans,
        provider,
        cancelled,
        mut on_job,
        mut on_doc,
    } = args;

    let seg_texts = split_into_segments(&story_text);
    if seg_texts.is_empty() {
        return Err(ApiError::Parse("No segments".to_string()));
    }

    let mut job = TranslationJob {
        id: job_id,
        segments: seg_texts
            .iter()
            .enumerate()
            .map(|(i, s)| TranslationSegment {
                id: format!("seg-{}", i + 1),
                source: s.clone(),
                base_text: None,
                base_stage: SegmentStage::Pending,
                span_stage: SegmentStage::Pending,
                variant_count: 0,
            })
            .collect(),
        ready: false,
    };

    on_job.call(&job).await;

    let mut cfg = ApiConfig::from_env(&target_language, source_language.as_deref(), adult_mode, dense_spans);
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
    }

    enum Client {
        Anthropic(AnthropicClient),
        OpenAiCompat(OpenAiCompatClient),
    }

    impl Client {
        async fn translate_base_segment(&self, full_story: &str, segment: &str) -> Result<(String, super::types::Usage), ApiError> {
            match self {
                Client::Anthropic(c) => c.translate_base_segment(full_story, segment).await,
                Client::OpenAiCompat(c) => c.translate_base_segment(full_story, segment).await,
            }
        }
        async fn plan_block_from_base(&self, base_text: &str) -> Result<(PlannedBlock, super::types::Usage), ApiError> {
            match self {
                Client::Anthropic(c) => c.plan_block_from_base(base_text).await,
                Client::OpenAiCompat(c) => c.plan_block_from_base(base_text).await,
            }
        }
        async fn generate_span_variants(&self, segment_context: &str, anchor_phrase: &str) -> Result<(Vec<super::anthropic::PlannedVariant>, super::types::Usage), ApiError> {
            match self {
                Client::Anthropic(c) => c.generate_span_variants(segment_context, anchor_phrase).await,
                Client::OpenAiCompat(c) => c.generate_span_variants(segment_context, anchor_phrase).await,
            }
        }
    }

    let client = match cfg.provider.preset {
        LlmProviderPreset::Anthropic => Client::Anthropic(AnthropicClient::new(cfg)?),
        _ => Client::OpenAiCompat(OpenAiCompatClient::new(cfg)?),
    };

    let mut planned_blocks: Vec<PlannedBlock> = Vec::new();

    for i in 0..job.segments.len() {
        if cancelled.load(Ordering::Relaxed) {
            return Err(ApiError::Parse("Cancelled".to_string()));
        }
        let seg_src = job.segments[i].source.clone();

        match client.translate_base_segment(&story_text, &seg_src).await {
            Ok((base, _usage)) => {
                job.segments[i].base_text = Some(base.clone());
                job.segments[i].base_stage = SegmentStage::Ready;
                on_job.call(&job).await;

                let block = match client.plan_block_from_base(&base).await {
                    Ok((b, _usage)) => b,
                    Err(e) => {
                        job.segments[i].span_stage = SegmentStage::Error;
                        on_job.call(&job).await;
                        return Err(e);
                    }
                };

                let mut next_block = block;
                let mut variant_count: u32 = 0;

                let mut swappable_anchors: Vec<(usize, String)> = Vec::new();
                for (seg_i, seg) in next_block.segments.iter().enumerate() {
                    let span = match seg {
                        PlannedSegment::Swappable(s) => s,
                        _ => continue,
                    };

                    let anchor = span
                        .variants
                        .get(0)
                        .map(|v| v.text.as_str())
                        .unwrap_or("");

                    if anchor.trim().is_empty() {
                        continue;
                    }

                    swappable_anchors.push((seg_i, anchor.to_string()));
                }

                for (seg_i, anchor) in swappable_anchors {
                    if cancelled.load(Ordering::Relaxed) {
                        return Err(ApiError::Parse("Cancelled".to_string()));
                    }

                    let variants = match client.generate_span_variants(&base, &anchor).await {
                        Ok((vs, _usage)) => vs,
                        Err(e) => {
                            job.segments[i].span_stage = SegmentStage::Error;
                            on_job.call(&job).await;
                            return Err(e);
                        }
                    };
                    let variants_len = variants.len();

                    if let Some(seg) = next_block.segments.get_mut(seg_i) {
                        if let PlannedSegment::Swappable(span) = seg {
                            span.variants = variants;
                        }
                    }

                    variant_count += variants_len as u32;
                    job.segments[i].variant_count = variant_count;
                    on_job.call(&job).await;

                    let mut tmp = planned_blocks.clone();
                    tmp.push(next_block.clone());
                    let partial_doc = build_doc_from_blocks(tmp);
                    on_doc.call(&partial_doc).await;
                }

                job.segments[i].span_stage = SegmentStage::Ready;
                job.segments[i].variant_count = variant_count;
                on_job.call(&job).await;
                planned_blocks.push(next_block);

                let partial_doc = build_doc_from_blocks(planned_blocks.clone());
                on_doc.call(&partial_doc).await;
            }
            Err(e) => {
                job.segments[i].base_stage = SegmentStage::Error;
                job.segments[i].span_stage = SegmentStage::Error;
                on_job.call(&job).await;
                return Err(e);
            }
        }
    }

    let doc = build_doc_from_blocks(planned_blocks);
    job.ready = true;
    on_job.call(&job).await;

    Ok(TranslationResult { job, doc })
}

pub struct TranslationArgs {
    pub story_text: String,
    pub job_id: String,
    pub target_language: String,
    pub source_language: Option<String>,
    pub adult_mode: bool,
    pub dense_spans: bool,
    pub provider: LlmProviderConfig,
    pub cancelled: Arc<AtomicBool>,
    pub on_job: Box<dyn JobSink>,
    pub on_doc: Box<dyn DocSink>,
}

#[allow(clippy::type_complexity)]
pub trait JobSink: Send {
    fn call<'a>(&'a mut self, job: &'a TranslationJob) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>>;
}

impl<F, Fut> JobSink for F
where
    F: Send + 'static + FnMut(&TranslationJob) -> Fut,
    Fut: Send + 'static + std::future::Future<Output = ()>,
{
    fn call<'a>(
        &'a mut self,
        job: &'a TranslationJob,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
        Box::pin((self)(job))
    }
}

pub trait DocSink: Send {
    fn call<'a>(&'a mut self, doc: &'a InteractiveDoc) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>>;
}

impl<F, Fut> DocSink for F
where
    F: Send + 'static + FnMut(&InteractiveDoc) -> Fut,
    Fut: Send + 'static + Future<Output = ()>,
{
    fn call<'a>(&'a mut self, doc: &'a InteractiveDoc) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
        Box::pin((self)(doc))
    }
}

fn build_doc_from_blocks(blocks: Vec<PlannedBlock>) -> InteractiveDoc {
    let mut tokens: Vec<DocToken> = Vec::new();
    let mut spans: HashMap<String, Span> = HashMap::new();

    let mut span_counter: usize = 0;

    let total_blocks = blocks.len();

    for (bi, b) in blocks.into_iter().enumerate() {
        for seg in b.segments {
            match seg {
                PlannedSegment::Static(t) => {
                    if !t.is_empty() {
                        tokens.push(DocToken::Text { value: t });
                    }
                }
                PlannedSegment::Swappable(s) => {
                    span_counter += 1;
                    let span_id = format!("span-{}", span_counter);

                    let mut vars: Vec<Variant> = Vec::new();
                    for (vi, v) in s.variants.into_iter().enumerate() {
                        let reg = normalize_register(&v.register);
                        let id = if vi == 0 {
                            format!("{}-{}", span_id, reg)
                        } else {
                            format!("{}-{}-{}", span_id, reg, vi)
                        };
                        vars.push(Variant {
                            id,
                            register: reg,
                            text: v.text,
                            note: if v.note.trim().is_empty() { None } else { Some(v.note) },
                            difficulty: Some(v.difficulty),
                        });
                    }

                    let source_text = vars
                        .get(0)
                        .map(|v| v.text.clone())
                        .unwrap_or_default();

                    spans.insert(
                        span_id.clone(),
                        Span {
                            id: span_id.clone(),
                            source_text,
                            variants: vars,
                            active_variant_index: 0,
                        },
                    );

                    tokens.push(DocToken::Span { span_id });
                }
            }
        }

        if bi + 1 < total_blocks {
            tokens.push(DocToken::Text {
                value: "\n\n".to_string(),
            });
        }
    }

    InteractiveDoc { tokens, spans }
}

fn normalize_register(input: &str) -> String {
    match input.to_lowercase().as_str() {
        "formal" => "formal".to_string(),
        "literary" => "literary".to_string(),
        "neutral" => "neutral".to_string(),
        "casual" => "casual".to_string(),
        "colloquial" => "colloquial".to_string(),
        "vulgar" => "vulgar".to_string(),
        _ => "neutral".to_string(),
    }
}
