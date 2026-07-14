/// Provider restrictions — model availability, token limits, rate limits per provider.

use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub provider: String,
    pub max_input_tokens: u32,
    pub max_output_tokens: u32,
    pub supports_streaming: bool,
    pub supports_functions: bool,
    pub cost_per_1k_input: f64,
    pub cost_per_1k_output: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderRestrictions {
    pub provider: String,
    pub max_requests_per_min: u32,
    pub max_tokens_per_min: u32,
    pub max_concurrent: u32,
    pub allowed_models: Vec<String>,
}

pub struct Restrictions {
    providers: HashMap<String, ProviderRestrictions>,
    models: HashMap<String, ModelInfo>,
}

impl Restrictions {
    pub fn new() -> Self {
        let mut models = HashMap::new();
        let mut providers = HashMap::new();

        // OpenAI models
        for (name, input, output, ci, co) in [
            ("gpt-4", 8192u32, 4096u32, 0.03f64, 0.06f64),
            ("gpt-4-turbo", 128000, 4096, 0.01, 0.03),
            ("gpt-4o", 128000, 16384, 0.005, 0.015),
            ("gpt-3.5-turbo", 16385, 4096, 0.001, 0.002),
        ] {
            models.insert(
                name.to_string(),
                ModelInfo {
                    name: name.to_string(),
                    provider: "openai".to_string(),
                    max_input_tokens: input,
                    max_output_tokens: output,
                    supports_streaming: true,
                    supports_functions: true,
                    cost_per_1k_input: ci,
                    cost_per_1k_output: co,
                },
            );
        }

        // Anthropic models
        for (name, input, output, ci, co) in [
            ("claude-3-opus", 200000, 4096, 0.015, 0.075),
            ("claude-3-sonnet", 200000, 4096, 0.003, 0.015),
            ("claude-3-haiku", 200000, 4096, 0.00025, 0.00125),
        ] {
            models.insert(
                name.to_string(),
                ModelInfo {
                    name: name.to_string(),
                    provider: "anthropic".to_string(),
                    max_input_tokens: input,
                    max_output_tokens: output,
                    supports_streaming: true,
                    supports_functions: false,
                    cost_per_1k_input: ci,
                    cost_per_1k_output: co,
                },
            );
        }

        // Local gateway model (flexible)
        models.insert(
            "local".to_string(),
            ModelInfo {
                name: "local".to_string(),
                provider: "custom".to_string(),
                max_input_tokens: 128000,
                max_output_tokens: 16384,
                supports_streaming: true,
                supports_functions: true,
                cost_per_1k_input: 0.0,
                cost_per_1k_output: 0.0,
            },
        );

        providers.insert(
            "openai".to_string(),
            ProviderRestrictions {
                provider: "openai".to_string(),
                max_requests_per_min: 500,
                max_tokens_per_min: 1000000,
                max_concurrent: 50,
                allowed_models: vec![
                    "gpt-4".to_string(),
                    "gpt-4-turbo".to_string(),
                    "gpt-4o".to_string(),
                    "gpt-3.5-turbo".to_string(),
                ],
            },
        );

        providers.insert(
            "anthropic".to_string(),
            ProviderRestrictions {
                provider: "anthropic".to_string(),
                max_requests_per_min: 200,
                max_tokens_per_min: 500000,
                max_concurrent: 20,
                allowed_models: vec![
                    "claude-3-opus".to_string(),
                    "claude-3-sonnet".to_string(),
                    "claude-3-haiku".to_string(),
                ],
            },
        );

        providers.insert(
            "custom".to_string(),
            ProviderRestrictions {
                provider: "custom".to_string(),
                max_requests_per_min: 1000,
                max_tokens_per_min: 2000000,
                max_concurrent: 100,
                allowed_models: vec!["local".to_string()],
            },
        );

        Self { providers, models }
    }

    pub fn get_model(&self, name: &str) -> Option<&ModelInfo> {
        self.models.get(name)
    }

    pub fn get_provider(&self, name: &str) -> Option<&ProviderRestrictions> {
        self.providers.get(name)
    }

    pub fn list_models(&self, provider: Option<&str>) -> Vec<&ModelInfo> {
        match provider {
            Some(p) => self
                .models
                .values()
                .filter(|m| m.provider == p)
                .collect(),
            None => self.models.values().collect(),
        }
    }

    pub fn estimated_cost(&self, model: &str, input_tokens: u32, output_tokens: u32) -> Option<f64> {
        self.models.get(model).map(|m| {
            (input_tokens as f64 / 1000.0 * m.cost_per_1k_input)
                + (output_tokens as f64 / 1000.0 * m.cost_per_1k_output)
        })
    }
}
