use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LlmProviderPreset {
    Anthropic,
    Openai,
    Openrouter,
    Ollama,
    Lmstudio,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProviderConfig {
    pub preset: LlmProviderPreset,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
}

impl Default for LlmProviderConfig {
    fn default() -> Self {
        Self {
            preset: LlmProviderPreset::Anthropic,
            api_key: None,
            base_url: None,
            model: None,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct ApiConfig {
    pub provider: LlmProviderConfig,
    pub adult_mode: bool,
    pub target_language: String,
    pub source_language: Option<String>,
    pub dense_spans: bool,
}

impl ApiConfig {
    pub fn from_env(target_language: &str, source_language: Option<&str>, adult_mode: bool, dense_spans: bool) -> Self {
        let mut provider = LlmProviderConfig::default();
        provider.api_key = std::env::var("ANTHROPIC_API_KEY").ok();
        Self {
            provider,
            adult_mode,
            target_language: target_language.to_string(),
            source_language: source_language.map(|s| s.to_string()),
            dense_spans,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("No API key set for provider: {provider}")]
    NoApiKey { provider: String },

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("API returned error: {status} — {message}")]
    ApiResponse { status: u16, message: String },

    #[error("Failed to parse response: {0}")]
    Parse(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MessagesRequest {
    pub model: String,
    pub max_tokens: u32,
    pub system: String,
    pub messages: Vec<Message>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessagesResponse {
    pub content: Vec<ContentBlock>,
    pub usage: Option<ApiUsage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ApiUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

impl From<ApiUsage> for Usage {
    fn from(u: ApiUsage) -> Self {
        Self {
            input_tokens: u.input_tokens,
            output_tokens: u.output_tokens,
        }
    }
}
