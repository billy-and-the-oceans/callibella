use super::prompts;
use super::types::{ApiConfig, ApiError, Message, MessagesRequest, MessagesResponse, Role, Usage};

use serde_json::Value;
use std::time::Duration;

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL: &str = "claude-sonnet-4-20250514";
const API_VERSION: &str = "2023-06-01";

pub struct AnthropicClient {
    client: reqwest::Client,
    api_key: String,
    model: String,
    config: ApiConfig,
}

impl AnthropicClient {
    pub fn new(config: ApiConfig) -> Result<Self, ApiError> {
        let api_key = config
            .provider
            .api_key
            .clone()
            .and_then(|k| {
                let t = k.trim().to_string();
                if t.is_empty() { None } else { Some(t) }
            })
            .ok_or_else(|| ApiError::NoApiKey {
                provider: "anthropic".to_string(),
            })?;

        let model = config
            .provider
            .model
            .clone()
            .and_then(|m| {
                let t = m.trim().to_string();
                if t.is_empty() { None } else { Some(t) }
            })
            .unwrap_or_else(|| DEFAULT_MODEL.to_string());

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()?;

        Ok(Self {
            client,
            api_key,
            model,
            config,
        })
    }

    pub fn api_url(&self) -> &'static str {
        API_URL
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    pub async fn test_connection(&self) -> Result<(), ApiError> {
        let messages = vec![Message {
            role: Role::User,
            content: "ping".to_string(),
        }];

        let request = MessagesRequest {
            model: self.model.clone(),
            max_tokens: 1,
            system: "You are a connectivity test. Reply with OK.".to_string(),
            messages,
        };

        let response = self
            .client
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::ApiResponse {
                status: status.as_u16(),
                message: body,
            });
        }

        Ok(())
    }

    pub async fn translate_base_segment(
        &self,
        full_story: &str,
        segment: &str,
    ) -> Result<(String, Usage), ApiError> {
        let system = prompts::base_translation_system_prompt(
            &self.config.target_language,
            self.config.source_language.as_deref(),
            self.config.adult_mode,
        );

        let content = format!(
            "FULL STORY (context):\n{}\n\nSEGMENT TO TRANSLATE:\n{}",
            full_story, segment
        );

        let messages = vec![Message {
            role: Role::User,
            content,
        }];

        let request = MessagesRequest {
            model: self.model.clone(),
            max_tokens: 512,
            system,
            messages,
        };

        let response = self
            .client
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::ApiResponse {
                status: status.as_u16(),
                message: body,
            });
        }

        let resp: MessagesResponse = response.json().await?;
        let text = resp
            .content
            .iter()
            .filter_map(|b| b.text.as_deref())
            .collect::<Vec<_>>()
            .join("")
            .trim()
            .to_string();

        let usage = resp.usage.map(Usage::from).unwrap_or_default();
        Ok((text, usage))
    }

    pub async fn plan_block_from_base(&self, base_text: &str) -> Result<(PlannedBlock, Usage), ApiError> {
        let system = prompts::span_planning_system_prompt(
            &self.config.target_language,
            self.config.source_language.as_deref(),
            self.config.dense_spans,
        );

        let messages = vec![Message {
            role: Role::User,
            content: base_text.to_string(),
        }];

        let request = MessagesRequest {
            model: self.model.clone(),
            max_tokens: 2048,
            system,
            messages,
        };

        let response = self
            .client
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::ApiResponse {
                status: status.as_u16(),
                message: body,
            });
        }

        let resp: MessagesResponse = response.json().await?;
        let text = resp
            .content
            .iter()
            .filter_map(|b| b.text.as_deref())
            .collect::<Vec<_>>()
            .join("");

        let usage = resp.usage.map(Usage::from).unwrap_or_default();
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
        let system = prompts::span_variants_system_prompt(
            &self.config.target_language,
            self.config.source_language.as_deref(),
            self.config.adult_mode,
        );

        let content = format!(
            "SEGMENT CONTEXT:\n{}\n\nANCHOR PHRASE:\n{}",
            segment_context, anchor_phrase
        );

        let messages = vec![Message {
            role: Role::User,
            content,
        }];

        let request = MessagesRequest {
            model: self.model.clone(),
            max_tokens: 2048,
            system,
            messages,
        };

        let response = self
            .client
            .post(API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::ApiResponse {
                status: status.as_u16(),
                message: body,
            });
        }

        let resp: MessagesResponse = response.json().await?;
        let text = resp
            .content
            .iter()
            .filter_map(|b| b.text.as_deref())
            .collect::<Vec<_>>()
            .join("");

        let usage = resp.usage.map(Usage::from).unwrap_or_default();

        let cleaned = text
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

        Ok((variants, usage))
    }
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

#[derive(Debug, Clone)]
pub struct PlannedBlock {
    pub id: String,
    pub segments: Vec<PlannedSegment>,
}

#[derive(Debug, Clone)]
pub enum PlannedSegment {
    Static(String),
    Swappable(PlannedSpan),
}

#[derive(Debug, Clone)]
pub struct PlannedSpan {
    pub id: String,
    pub variants: Vec<PlannedVariant>,
}

#[derive(Debug, Clone)]
pub struct PlannedVariant {
    pub text: String,
    pub register: String,
    pub note: String,
    pub difficulty: u8,
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
                    let rb: RawBlock = serde_json::from_value(item).map_err(|e| {
                        ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt))
                    })?;
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
                let rb: RawBlock = serde_json::from_value(value).map_err(|e| {
                    ApiError::Parse(format!("JSON parse: {} | output: {}", e, excerpt))
                })?;
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
