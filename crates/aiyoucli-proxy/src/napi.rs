//! NAPI bindings for aiyoucli-proxy — LLM gateway, compression, firewall.

use std::sync::Mutex;

use crate::ast::Analyzer;
use crate::cache::ResponseCache;
use crate::compressor::Compressor;
use crate::embeddings::Embedder;
use crate::firewall::Firewall;
use crate::llm::{ChatMessage, LlmProvider, ProviderConfig};
use crate::restrictions::Restrictions;
use crate::segmenter::Segmenter;
use crate::semantic::SemanticRouter;
use crate::shield::Shield;
use serde_json::json;
use std::collections::HashMap;

/// Proxy engine combining LLM provider, shield, compressor, firewall, cache, segmenter, and embeddings.
#[napi]
pub struct ProxyEngine {
    llm: Mutex<LlmProvider>,
    firewall: Mutex<Firewall>,
    cache: ResponseCache,
    restrictions: Restrictions,
    embedder: tokio::sync::Mutex<Embedder>,
    runtime: tokio::runtime::Runtime,
    semantic_router: SemRouter,
}

struct SemRouter {
    keyword: SemanticRouter,
    embedding: Option<crate::embeddings::Embedder>,
}

#[napi]
impl ProxyEngine {
    #[napi(constructor)]
    pub fn new() -> Self {
        let runtime = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        Self {
            llm: Mutex::new(LlmProvider::new(ProviderConfig::default())),
            firewall: Mutex::new(Firewall::new()),
            cache: ResponseCache::new(300, 1000),
            restrictions: Restrictions::new(),
            embedder: tokio::sync::Mutex::new(Embedder::new(None)),
            semantic_router: SemRouter {
                keyword: SemanticRouter::new(None),
                embedding: None,
            },
            runtime,
        }
    }

    // ── LLM ────────────────────────────────────────────────

    /// Send a chat completion request.
    #[napi]
    pub fn chat_completion(
        &self,
        messages: Vec<serde_json::Value>,
        model: Option<String>,
    ) -> serde_json::Value {
        let chat_messages: Vec<ChatMessage> = messages
            .iter()
            .map(|m| ChatMessage {
                role: m["role"].as_str().unwrap_or("user").to_string(),
                content: m["content"].as_str().unwrap_or("").to_string(),
            })
            .collect();

        // Check cache
        let model_ref = model.as_deref().unwrap_or("default");
        let cache_key = ResponseCache::build_key(model_ref, &chat_messages);
        if let Some(cached) = self.cache.get(&cache_key) {
            return json!({
                "cached": true,
                "response": cached.response,
                "hits": cached.hits,
            });
        }

        // Firewall check
        let firewall_check = self
            .firewall
            .lock()
            .unwrap()
            .check_request("127.0.0.1", "/v1/chat/completions");
        if !firewall_check.allowed {
            return json!({
                "error": firewall_check.reason.unwrap_or("Blocked by firewall".to_string()),
                "blocked": true,
            });
        }

        // Shield check on messages
        for msg in &chat_messages {
            let shield_check = Shield::check(&msg.content);
            if !shield_check.passed {
                return json!({
                    "error": "Content blocked by shield",
                    "flags": shield_check.flags,
                    "blocked": true,
                });
            }
        }

        // Send request
        let result = self.runtime.block_on(async {
            self.llm
                .lock()
                .unwrap()
                .chat_completion(chat_messages.clone(), model)
                .await
        });

        match result {
            Ok(response) => {
                let resp_val = serde_json::to_value(&response).unwrap_or_default();
                self.cache.set(cache_key, resp_val.clone(), None);
                json!({
                    "cached": false,
                    "response": resp_val,
                })
            }
            Err(e) => json!({
                "error": e.to_string(),
            }),
        }
    }

    /// Check if the provider/gateway is reachable.
    #[napi]
    pub fn health_check(&self) -> serde_json::Value {
        let result = self.runtime.block_on(async {
            self.llm.lock().unwrap().health_check().await
        });
        match result {
            Ok(status) => serde_json::to_value(&status).unwrap_or_default(),
            Err(e) => json!({ "reachable": false, "error": e.to_string() }),
        }
    }

    // ── Shield ──────────────────────────────────────────────

    /// Check content against shield rules.
    #[napi]
    pub fn shield_check(&self, content: String) -> serde_json::Value {
        let check = Shield::check(&content);
        json!({
            "passed": check.passed,
            "flags": check.flags,
            "flagged": !check.passed,
        })
    }

    // ── Compressor ──────────────────────────────────────────

    /// Compress messages by pruning and truncating.
    #[napi]
    pub fn compress_messages(
        &self,
        messages: Vec<serde_json::Value>,
        max_messages: Option<i32>,
        max_message_chars: Option<i32>,
    ) -> serde_json::Value {
        let chat_messages: Vec<ChatMessage> = messages
            .iter()
            .map(|m| ChatMessage {
                role: m["role"].as_str().unwrap_or("user").to_string(),
                content: m["content"].as_str().unwrap_or("").to_string(),
            })
            .collect();

        let result = Compressor::compress_messages(
            &chat_messages,
            max_messages.unwrap_or(20) as usize,
            max_message_chars.unwrap_or(4000) as usize,
        );
        serde_json::to_value(&result).unwrap_or_default()
    }

    /// Analyze text for compression opportunities.
    #[napi]
    pub fn analyze_text(&self, text: String) -> serde_json::Value {
        Compressor::analyze(&text)
    }

    // ── Firewall ────────────────────────────────────────────

    /// Check firewall for a request origin.
    #[napi]
    pub fn firewall_check(&self, origin: String, path: String) -> serde_json::Value {
        let check = self.firewall.lock().unwrap().check_request(&origin, &path);
        serde_json::to_value(&check).unwrap_or_default()
    }

    /// Block an origin in the firewall.
    #[napi]
    pub fn block_origin(&self, origin: String) {
        self.firewall.lock().unwrap().block_origin(&origin);
    }

    /// Unblock an origin.
    #[napi]
    pub fn unblock_origin(&self, origin: String) {
        self.firewall.lock().unwrap().unblock_origin(&origin);
    }

    /// Get blocked origins.
    #[napi]
    pub fn blocked_origins(&self) -> Vec<String> {
        self.firewall.lock().unwrap().blocked_origins().to_vec()
    }

    // ── Cache ───────────────────────────────────────────────

    /// Get cache statistics.
    #[napi]
    pub fn cache_stats(&self) -> serde_json::Value {
        self.cache.stats()
    }

    /// Clear the response cache.
    #[napi]
    pub fn clear_cache(&self) {
        self.cache.clear();
    }

    // ── Segmenter ──────────────────────────────────────────

    /// Split text into fixed-size chunks.
    #[napi]
    pub fn segment_by_chunks(
        &self,
        text: String,
        chunk_size: i32,
        overlap: Option<i32>,
    ) -> serde_json::Value {
        let result =
            Segmenter::by_chunk_size(&text, chunk_size as usize, overlap.unwrap_or(0) as usize);
        serde_json::to_value(&result).unwrap_or_default()
    }

    /// Split text by sentences.
    #[napi]
    pub fn segment_by_sentences(&self, text: String, max_chars: Option<i32>) -> serde_json::Value {
        let result = Segmenter::by_sentences(&text, max_chars.unwrap_or(2000) as usize);
        serde_json::to_value(&result).unwrap_or_default()
    }

    // ── Restrictions ────────────────────────────────────────

    /// List models, optionally filtered by provider.
    #[napi]
    pub fn list_models(&self, provider: Option<String>) -> Vec<serde_json::Value> {
        self.restrictions
            .list_models(provider.as_deref())
            .into_iter()
            .map(|m| serde_json::to_value(m).unwrap_or_default())
            .collect()
    }

    /// Estimate cost for a model with given token counts.
    #[napi]
    pub fn estimated_cost(
        &self,
        model: String,
        input_tokens: i32,
        output_tokens: i32,
    ) -> serde_json::Value {
        let cost = self
            .restrictions
            .estimated_cost(&model, input_tokens as u32, output_tokens as u32);
        json!({
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": cost,
        })
    }

    // ── Embeddings ──────────────────────────────────────────

    /// Generate an embedding for a single text.
    #[napi]
    pub fn embed_text(&self, text: String) -> serde_json::Value {
        let result = self.runtime.block_on(async {
            self.embedder.lock().await.embed_one(text).await
        });
        match result {
            Ok(embedding) => {
                json!({ "embedding": embedding, "dimensions": embedding.len() })
            }
            Err(e) => json!({ "error": e.to_string() }),
        }
    }

    /// Generate embeddings for multiple texts.
    #[napi]
    pub fn embed_texts(&self, texts: Vec<String>) -> serde_json::Value {
        let result = self.runtime.block_on(async {
            self.embedder.lock().await.embed(texts).await
        });
        match result {
            Ok(embeddings) => {
                let dims: Vec<usize> = embeddings.iter().map(|e| e.len()).collect();
                json!({ "embeddings": embeddings, "count": embeddings.len(), "dimensions": dims })
            }
            Err(e) => json!({ "error": e.to_string() }),
        }
    }

    // ── AST Analyzer ────────────────────────────────────────────

    /// Analyze a single source file — extract functions, classes, imports, complexity.
    #[napi]
    pub fn analyze_code(&self, path: String, source: String) -> serde_json::Value {
        let result = Analyzer::analyze(&path, &source);
        serde_json::to_value(&result).unwrap_or_default()
    }

    /// Analyze multiple source files at once.
    /// Input: array of [path, source] pairs.
    #[napi]
    pub fn analyze_code_batch(&self, files: Vec<Vec<String>>) -> serde_json::Value {
        let pairs: Vec<(String, String)> = files
            .into_iter()
            .filter(|f| f.len() >= 2)
            .map(|f| (f[0].clone(), f[1].clone()))
            .collect();
        let result = Analyzer::analyze_batch(pairs);
        serde_json::to_value(&result).unwrap_or_default()
    }

    /// Detect the programming language of a file by its path.
    #[napi]
    pub fn detect_language(&self, path: String) -> String {
        let lang = crate::ast::Language::from_filename(&path);
        format!("{:?}", lang)
    }

    // ── Semantic Router ─────────────────────────────────────────

    /// Route a task description to the best agent type using keyword matching.
    #[napi]
    pub fn semantic_route(&self, task: String) -> serde_json::Value {
        let result = self.semantic_router.keyword.route(&task);
        serde_json::to_value(&result).unwrap_or_default()
    }

    /// Route with hybrid keyword + embedding scores.
    /// embedding_scores: JSON object like {"coder": 0.8, "tester": 0.2, ...}
    #[napi]
    pub fn semantic_route_hybrid(
        &self,
        task: String,
        embedding_scores: serde_json::Value,
    ) -> serde_json::Value {
        let scores: HashMap<String, f64> = embedding_scores
            .as_object()
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| {
                        v.as_f64().map(|score| (k.clone(), score))
                    })
                    .collect()
            })
            .unwrap_or_default();

        let result = self.semantic_router.keyword.route_with_embeddings(&task, scores);
        serde_json::to_value(&result).unwrap_or_default()
    }

    /// Get an 8-dimension embedding vector for a text (keyword-based, for routing).
    #[napi]
    pub fn semantic_embed(&self, text: String) -> Vec<f64> {
        self.semantic_router.keyword.embed(&text)
    }

    /// Get semantic router statistics.
    #[napi]
    pub fn semantic_stats(&self) -> serde_json::Value {
        self.semantic_router.keyword.stats()
    }
}
