use crate::DEFAULT_GATEWAY_URL;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProviderKind {
    Openai,
    Anthropic,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub kind: ProviderKind,
    pub api_key: Option<String>,
    pub base_url: String,
    pub default_model: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            kind: ProviderKind::Custom,
            api_key: None,
            base_url: DEFAULT_GATEWAY_URL.to_string(),
            default_model: "gpt-4".to_string(),
            max_tokens: 4096,
            temperature: 0.7,
        }
    }
}

/// LLM provider that routes requests to the configured backend.
pub struct LlmProvider {
    config: ProviderConfig,
    client: reqwest::Client,
}

impl LlmProvider {
    pub fn new(config: ProviderConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("Failed to create HTTP client");
        Self { config, client }
    }

    pub fn config(&self) -> &ProviderConfig {
        &self.config
    }

    /// Send a chat completion request to the configured provider.
    pub async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        model: Option<String>,
    ) -> Result<ChatResponse, LlmError> {
        let model = model.unwrap_or(self.config.default_model.clone());
        let url = match self.config.kind {
            ProviderKind::Openai => format!("{}/chat/completions", self.config.base_url),
            ProviderKind::Anthropic => format!("{}/messages", self.config.base_url),
            ProviderKind::Custom => format!("{}/chat/completions", self.config.base_url),
        };

        let body = ChatRequest {
            model: model.clone(),
            messages: messages.clone(),
            max_tokens: self.config.max_tokens,
            temperature: self.config.temperature,
        };

        let mut req = self.client.post(&url).json(&body);

        if let Some(ref key) = self.config.api_key {
            let auth_header = match self.config.kind {
                ProviderKind::Anthropic => format!("Bearer {}", key),
                _ => format!("Bearer {}", key),
            };
            req = req.header("Authorization", auth_header);
        }

        let resp = req.send().await.map_err(|e| LlmError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(LlmError::ApiError(status.as_u16(), text));
        }

        resp.json::<ChatResponse>()
            .await
            .map_err(|e| LlmError::ParseError(e.to_string()))
    }

    /// Stream a chat completion (returns a stream of chunks).
    pub async fn chat_completion_stream(
        &self,
        messages: Vec<ChatMessage>,
        model: Option<String>,
    ) -> Result<reqwest::Response, LlmError> {
        let model = model.unwrap_or(self.config.default_model.clone());
        let url = match self.config.kind {
            ProviderKind::Openai => format!("{}/chat/completions", self.config.base_url),
            ProviderKind::Anthropic => format!("{}/messages", self.config.base_url),
            ProviderKind::Custom => format!("{}/chat/completions", self.config.base_url),
        };

        let body = ChatRequest {
            model: model.clone(),
            messages: messages.clone(),
            max_tokens: self.config.max_tokens,
            temperature: self.config.temperature,
        };

        let mut req = self.client.post(&url).json(&body);

        if let Some(ref key) = self.config.api_key {
            req = req.header("Authorization", format!("Bearer {}", key));
        }

        let resp = req.send().await.map_err(|e| LlmError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(LlmError::ApiError(status.as_u16(), text));
        }

        Ok(resp)
    }

    /// Check if the provider/gateway is reachable.
    pub async fn health_check(&self) -> Result<HealthStatus, LlmError> {
        let url = format!("{}/health", self.config.base_url.trim_end_matches("/v1"));
        match self.client.get(&url).send().await {
            Ok(resp) => Ok(HealthStatus {
                reachable: resp.status().is_success(),
                status_code: resp.status().as_u16(),
                latency_ms: 0,
                provider: format!("{:?}", self.config.kind),
                error: None,
            }),
            Err(e) => Ok(HealthStatus {
                reachable: false,
                status_code: 0,
                latency_ms: 0,
                provider: format!("{:?}", self.config.kind),
                error: Some(e.to_string()),
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
    temperature: f32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ChatResponse {
    pub id: Option<String>,
    pub object: Option<String>,
    pub created: Option<u64>,
    pub model: Option<String>,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Choice {
    pub index: u32,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize)]
pub struct HealthStatus {
    pub reachable: bool,
    pub status_code: u16,
    pub latency_ms: u64,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug)]
pub enum LlmError {
    HttpError(String),
    ApiError(u16, String),
    ParseError(String),
}

impl std::fmt::Display for LlmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LlmError::HttpError(msg) => write!(f, "HTTP error: {}", msg),
            LlmError::ApiError(code, msg) => write!(f, "API error ({}): {}", code, msg),
            LlmError::ParseError(msg) => write!(f, "Parse error: {}", msg),
        }
    }
}
