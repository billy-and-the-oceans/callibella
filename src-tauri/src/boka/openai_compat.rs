use super::anthropic::{PlannedBlock, PlannedSegment, PlannedSpan, PlannedVariant};
use super::prompts;
use super::types::{ApiConfig, ApiError, LlmProviderPreset, Usage};

use serde_json::Value;
use std::time::Duration;

pub struct OpenAiCompatClient {
    client: reqwest::Client,
    config: ApiConfig,
    base_url: String,
    api_key: Option<String>,
    model: String,
}

struct Defaults {
    base_url: Option<String>,
    model: Option<String>,
}

fn defaults_for_preset(preset: &LlmProviderPreset) -> Defaults {
    match preset {
        LlmProviderPreset::Openai => Defaults {
            base_url: Some("https://api.openai.com/v1".to_string()),
            model: Some("gpt-4o-mini".to_string()),
        },
        LlmProviderPreset::Openrouter => Defaults {
            base_url: Some("https://openrouter.ai/api/v1".to_string()),
            model: Some("openai/gpt-4o-mini".to_string()),
        },
        LlmProviderPreset::Ollama => Defaults {
            base_url: Some("http://localhost:11434/v1".to_string()),
            model: Some("llama3.1".to_string()),
        },
        LlmProviderPreset::Lmstudio => Defaults {
            base_url: Some("http://localhost:1234/v1".to_string()),
            model: Some("llama3.1".to_string()),
        },
        LlmProviderPreset::Custom => Defaults {
            base_url: None,
            model: None,
        },
        LlmProviderPreset::Anthropic => Defaults {
            base_url: None,
            model: None,
        },
    }
}

impl OpenAiCompatClient {
    pub fn new(config: ApiConfig) -> Result<Self, ApiError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()?;

        let defaults = defaults_for_preset(&config.provider.preset);
        let base_url = config
            .provider
            .base_url
            .clone()
            .and_then(|u| {
                let t = u.trim().to_string();
                if t.is_empty() { None } else { Some(t) }
            })
            .or_else(|| defaults.base_url)
            .unwrap_or_default()
            .trim()
            .trim_end_matches('/')
            .to_string();

        if base_url.is_empty() {
            return Err(ApiError::Parse("OpenAI-compatible baseUrl is required".to_string()));
        }

        let model = config
            .provider
            .model
            .clone()
            .and_then(|m| {
                let t = m.trim().to_string();
                if t.is_empty() { None } else { Some(t) }
            })
            .or_else(|| defaults.model)
            .unwrap_or_default()
            .trim()
            .to_string();

        if model.is_empty() {
            return Err(ApiError::Parse("OpenAI-compatible model is required".to_string()));
        }

        let api_key = config
            .provider
            .api_key
            .clone()
            .and_then(|k| {
                let t = k.trim().to_string();
                if t.is_empty() {
                    None
                } else {
                    Some(t)
                }
            });

        if matches!(
            config.provider.preset,
            LlmProviderPreset::Openai | LlmProviderPreset::Openrouter
        ) && api_key.is_none()
        {
            return Err(ApiError::NoApiKey {
                provider: format!("{:?}", config.provider.preset).to_lowercase(),
            });
        }

        Ok(Self {
            client,
            config,
            base_url,
            api_key,
            model,
        })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    pub fn has_api_key(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn chat_completions_url(&self) -> String {
        format!("{}/chat/completions", self.base_url)
    }

    async fn chat(&self, system: String, user: String, max_tokens: u32) -> Result<(String, Usage), ApiError> {
        let url = self.chat_completions_url();

        let body = serde_json::json!({
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
        });

        let mut req = self
            .client
            .post(url)
            .header("content-type", "application/json")
            .json(&body);

        if let Some(key) = &self.api_key {
            req = req.header("authorization", format!("Bearer {}", key));
        }

        let response = req.send().await?;
        let status = response.status();
        let raw: Value = response.json().await?;

        if !status.is_success() {
            return Err(ApiError::ApiResponse {
                status: status.as_u16(),
                message: raw.to_string(),
            });
        }

        let text = raw
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        let usage = raw
            .get("usage")
            .and_then(|u| {
                Some(Usage {
                    input_tokens: u.get("prompt_tokens")?.as_u64()? as u32,
                    output_tokens: u.get("completion_tokens")?.as_u64()? as u32,
                })
            })
            .unwrap_or_default();

        Ok((text, usage))
    }

    pub async fn translate_base_segment(&self, full_story: &str, segment: &str) -> Result<(String, Usage), ApiError> {
        let system = prompts::base_translation_system_prompt(&self.config.target_language, self.config.source_language.as_deref(), self.config.adult_mode);
        let content = format!(
            "FULL STORY (context):\n{}\n\nSEGMENT TO TRANSLATE:\n{}",
            full_story, segment
        );

        self.chat(system, content, 512).await
    }

    pub async fn plan_block_from_base(&self, base_text: &str) -> Result<(PlannedBlock, Usage), ApiError> {
        let system = prompts::span_planning_system_prompt(&self.config.target_language, self.config.source_language.as_deref(), self.config.dense_spans);
        let (text, usage) = self.chat(system, base_text.to_string(), 2048).await?;

        let mut blocks = parse_planned_blocks(&text)?;
        let block = blocks
            .drain(..)
            .next()
            .ok_or_else(|| ApiError::Parse("No block returned".to_string()))?;

        Ok((block, usage))
    }

    pub async fn generate_span_variants(
        &self,
        segment_context: &str,
        anchor_phrase: &str,
    ) -> Result<(Vec<PlannedVariant>, Usage), ApiError> {
        let system = prompts::span_variants_system_prompt(&self.config.target_language, self.config.source_language.as_deref(), self.config.adult_mode);
        let content = format!(
            "SEGMENT CONTEXT:\n{}\n\nANCHOR PHRASE:\n{}",
            segment_context, anchor_phrase
        );

        let (text, usage) = self.chat(system, content, 2048).await?;
        let variants = parse_variants(&text)?;
        Ok((variants, usage))
    }

    pub async fn test_connection(&self) -> Result<(), ApiError> {
        let system = "You are a connectivity test. Reply with OK.".to_string();
        let user = "ping".to_string();
        let _ = self.chat(system, user, 1).await?;
        Ok(())
    }
}

fn parse_variants(json_text: &str) -> Result<Vec<PlannedVariant>, ApiError> {
    let cleaned = json_text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let excerpt = if cleaned.len() > 800 {
        format!("{}…", &cleaned[..800])
    } else {
        cleaned.to_string()
    };

    let raw_value: Value = match serde_json::from_str(cleaned) {
        Ok(v) => v,
        Err(_e) => {
            let sanitized = sanitize_json_trailing_commas(cleaned);
            serde_json::from_str(&sanitized)
                .map_err(|e| ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt)))?
        }
    };

    let raw_variants: Vec<RawVariant> = match raw_value {
        Value::Array(_) => serde_json::from_value(raw_value)
            .map_err(|e| ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt)))?,
        Value::Object(ref obj) => {
            if let Some(vs) = obj.get("variants") {
                serde_json::from_value(vs.clone())
                    .map_err(|e| ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt)))?
            } else if obj.get("text").is_some() {
                vec![serde_json::from_value(raw_value)
                    .map_err(|e| ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt)))?]
            } else {
                return Err(ApiError::Parse(format!(
                    "JSON parse: expected array/object variant | output: {}",
                    excerpt
                )));
            }
        }
        _ => {
            return Err(ApiError::Parse(format!(
                "JSON parse: expected array/object | output: {}",
                excerpt
            )));
        }
    };

    let variants = raw_variants
        .into_iter()
        .filter(|v| !v.text.trim().is_empty())
        .map(|v| PlannedVariant {
            text: v.text,
            register: v.register,
            note: v.note.unwrap_or_default(),
            difficulty: v.difficulty.unwrap_or(2),
        })
        .collect();

    Ok(variants)
}

fn sanitize_json_trailing_commas(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escape = false;

    while let Some(c) = chars.next() {
        if in_string {
            out.push(c);
            if escape {
                escape = false;
                continue;
            }
            if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }

        if c == '"' {
            in_string = true;
            out.push(c);
            continue;
        }

        if c == ',' {
            let mut look = chars.clone();
            while let Some(n) = look.peek() {
                if n.is_whitespace() {
                    look.next();
                } else {
                    break;
                }
            }
            if matches!(look.peek(), Some(']') | Some('}')) {
                continue;
            }
        }

        out.push(c);
    }

    out
}

fn parse_planned_blocks(json_text: &str) -> Result<Vec<PlannedBlock>, ApiError> {
    let cleaned = json_text
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let excerpt = if cleaned.len() > 800 {
        format!("{}…", &cleaned[..800])
    } else {
        cleaned.to_string()
    };

    let value: Value = serde_json::from_str(cleaned)
        .map_err(|e| ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt)))?;

    let mut raw_blocks: Vec<RawBlock> = Vec::new();
    match value {
        Value::Array(items) => {
            for item in items {
                if item.get("segments").is_some() {
                    let rb: RawBlock = serde_json::from_value(item)
                        .map_err(|e| ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt)))?;
                    raw_blocks.push(rb);
                } else if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                    raw_blocks.push(RawBlock {
                        id: item
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        segments: vec![RawSegment {
                            segment_type: "static".to_string(),
                            id: None,
                            text: Some(text.to_string()),
                            variants: None,
                        }],
                    });
                } else {
                    return Err(ApiError::Parse(format!(
                        "JSON parse: block missing `segments` | output: {}",
                        excerpt
                    )));
                }
            }
        }
        Value::Object(_) => {
            if value.get("segments").is_some() {
                let rb: RawBlock = serde_json::from_value(value)
                    .map_err(|e| ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt)))?;
                raw_blocks.push(rb);
            } else if let Some(text) = value.get("text").and_then(|v| v.as_str()) {
                raw_blocks.push(RawBlock {
                    id: value
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or_default()
                        .to_string(),
                    segments: vec![RawSegment {
                        segment_type: "static".to_string(),
                        id: None,
                        text: Some(text.to_string()),
                        variants: None,
                    }],
                });
            } else {
                return Err(ApiError::Parse(format!(
                    "JSON parse: missing `segments` | output: {}",
                    excerpt
                )));
            }
        }
        _ => {
            return Err(ApiError::Parse(format!(
                "JSON parse: expected array/object | output: {}",
                excerpt
            )));
        }
    }

    let blocks = raw_blocks
        .into_iter()
        .map(|rb| {
            let segments = rb
                .segments
                .into_iter()
                .map(|seg| match seg.segment_type.as_str() {
                    "static" => PlannedSegment::Static(seg.text.unwrap_or_default()),
                    "swappable" => {
                        let variants = seg
                            .variants
                            .unwrap_or_default()
                            .into_iter()
                            .map(|v| PlannedVariant {
                                text: v.text,
                                register: v.register,
                                note: v.note.unwrap_or_default(),
                                difficulty: v.difficulty.unwrap_or(2),
                            })
                            .collect();
                        PlannedSegment::Swappable(PlannedSpan {
                            id: seg.id.unwrap_or_default(),
                            variants,
                        })
                    }
                    _ => PlannedSegment::Static(seg.text.unwrap_or_default()),
                })
                .collect();

            PlannedBlock { id: rb.id, segments }
        })
        .collect();

    Ok(blocks)
}

#[derive(serde::Deserialize)]
struct RawBlock {
    #[serde(default)]
    id: String,
    #[serde(default)]
    segments: Vec<RawSegment>,
}

#[derive(serde::Deserialize)]
struct RawSegment {
    #[serde(default, rename = "type")]
    segment_type: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    variants: Option<Vec<RawVariant>>,
}

#[derive(serde::Deserialize)]
struct RawVariant {
    #[serde(default)]
    text: String,
    #[serde(default)]
    register: String,
    #[serde(default)]
    note: Option<String>,
    #[serde(default)]
    difficulty: Option<u8>,
}
