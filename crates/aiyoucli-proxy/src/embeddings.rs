/// Embeddings — generate text embeddings via the local gateway or provider.

use crate::{DEFAULT_EMBED_URL, DEFAULT_GATEWAY_URL};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct EmbeddingRequest {
    pub model: String,
    pub input: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct EmbeddingResponse {
    pub data: Vec<EmbeddingData>,
    pub model: Option<String>,
    pub usage: Option<super::llm::Usage>,
}

#[derive(Debug, Deserialize)]
pub struct EmbeddingData {
    pub embedding: Vec<f64>,
    pub index: u32,
}

pub struct Embedder {
    client: reqwest::Client,
    base_url: String,
    default_model: String,
}

impl Embedder {
    pub fn new(gateway_url: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: gateway_url.unwrap_or_else(|| DEFAULT_EMBED_URL.to_string()),
            default_model: "all-MiniLM-L6-v2".to_string(),
        }
    }

    /// Generate embeddings for a list of texts.
    pub async fn embed(&self, inputs: Vec<String>) -> Result<Vec<Vec<f64>>, EmbedError> {
        let url = self.base_url.trim_end_matches('/').to_string() + "/embeddings";

        let body = EmbeddingRequest {
            model: self.default_model.clone(),
            input: inputs,
        };

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| EmbedError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(EmbedError::ApiError(status.as_u16(), text));
        }

        let result = resp
            .json::<EmbeddingResponse>()
            .await
            .map_err(|e| EmbedError::ParseError(e.to_string()))?;

        let embeddings: Vec<Vec<f64>> = result.data.into_iter().map(|d| d.embedding).collect();

        Ok(embeddings)
    }

    /// Generate a single embedding.
    pub async fn embed_one(&self, text: String) -> Result<Vec<f64>, EmbedError> {
        let mut result = self.embed(vec![text]).await?;
        result.pop().ok_or(EmbedError::EmptyResponse)
    }
}

#[derive(Debug)]
pub enum EmbedError {
    HttpError(String),
    ApiError(u16, String),
    ParseError(String),
    EmptyResponse,
}

impl std::fmt::Display for EmbedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EmbedError::HttpError(msg) => write!(f, "HTTP error: {}", msg),
            EmbedError::ApiError(code, msg) => write!(f, "API error ({}): {}", code, msg),
            EmbedError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            EmbedError::EmptyResponse => write!(f, "Empty response"),
        }
    }
}
