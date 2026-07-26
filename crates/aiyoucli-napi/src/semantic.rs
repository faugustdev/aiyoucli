//! Semantic Router — routes tasks to agent types via embedding similarity.
//!
//! Thin wrapper over `aiyouvector_routing::semantic::SemanticRouter`. The
//! keyword-based scoring that previously lived here (414 lines) was
//! duplicate intelligence — aiyouvector-routing already ships an
//! embedding-based router covering the same 8 agents (coder, researcher,
//! tester, reviewer, architect, security, debugger, documenter).
//!
//! Pillar C (Pillar C — Cerrar la duplicación con aiyoucli) consolidates
//! routing intelligence in aiyouvector-routing. This file is now a
//! translation layer that maps the upstream `SemanticRouteResult` to the
//! JSON shape expected by `proxy.rs` and the MCP tools that consume it
//! via `src/napi/proxy.ts`.
//!
//! API surface preserved (consumed by `proxy.rs`):
//!   - `SemanticRoute { route, confidence, method, scores, model_tier }`
//!   - `RouteScore { route, score }`
//!   - `RouterConfig { models_path, use_embeddings, min_confidence }`
//!   - `SemanticRouter::new(config) -> Self`
//!   - `SemanticRouter::route(task) -> SemanticRoute`
//!   - `SemanticRouter::route_with_embeddings(task, scores) -> SemanticRoute`
//!   - `SemanticRouter::embed(text) -> Vec<f64>`
//!   - `SemanticRouter::stats() -> serde_json::Value`
//!   - `SemanticRouter::agent_profiles() -> serde_json::Value`

use std::collections::HashMap;

use serde::Serialize;
use serde_json::json;

use aiyouvector_routing::semantic::SemanticRouter as UpstreamRouter;
use aiyouvector_routing::{keywords_for, model_tier_for, AGENT_TYPES};

/// The JSON shape the proxy.rs NAPI binding expects.
#[derive(Debug, Clone, Serialize)]
pub struct SemanticRoute {
    pub route: String,
    pub confidence: f64,
    pub method: String,
    pub scores: Vec<RouteScore>,
    pub model_tier: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteScore {
    pub route: String,
    pub score: f64,
}

/// Configuration the proxy.rs constructor receives. Most fields are
/// kept for API compatibility with the previous keyword-based router;
/// only `min_confidence` has any meaningful effect on behavior today.
#[derive(Debug, Clone, Serialize)]
pub struct RouterConfig {
    pub models_path: Option<String>,
    pub use_embeddings: bool,
    pub min_confidence: f64,
}

impl Default for RouterConfig {
    fn default() -> Self {
        Self {
            models_path: None,
            use_embeddings: true,
            min_confidence: 0.15,
        }
    }
}

/// Wraps `aiyouvector_routing::semantic::SemanticRouter` and adapts its
/// `SemanticRouteResult` (route, similarity, scores) into the
/// `SemanticRoute` shape that the proxy engine has historically returned.
pub struct SemanticRouter {
    config: RouterConfig,
    inner: UpstreamRouter,
}

impl SemanticRouter {
    pub fn new(config: Option<RouterConfig>) -> Self {
        Self {
            config: config.unwrap_or_default(),
            inner: UpstreamRouter::new(),
        }
    }

    /// Route a task to the best agent type using embedding similarity.
    pub fn route(&self, task: &str) -> SemanticRoute {
        let result = self.inner.route(task);

        // Convert upstream `scores: Vec<(String, f32)>` to our shape.
        let scores: Vec<RouteScore> = result
            .scores
            .iter()
            .map(|(route, score)| RouteScore {
                route: route.clone(),
                score: *score as f64,
            })
            .collect();

        // Confidence maps to similarity for the embedding-based router.
        let confidence = result.similarity as f64;

        SemanticRoute {
            route: result.route.clone(),
            confidence,
            method: "embedding".to_string(),
            model_tier: model_tier_for(&result.route).to_string(),
            scores,
        }
    }

    /// Route with hybrid scoring — combines the upstream embedding-based
    /// result with user-provided embedding scores. The user's scores
    /// receive 60% weight, the upstream router's scores 40%.
    pub fn route_with_embeddings(
        &self,
        task: &str,
        embedding_scores: HashMap<String, f64>,
    ) -> SemanticRoute {
        // Start from the embedding-based route.
        let base = self.route(task);

        // Blend per-agent scores.
        let blended: Vec<RouteScore> = base
            .scores
            .iter()
            .map(|s| {
                let user_score = embedding_scores.get(&s.route).copied().unwrap_or(0.0);
                RouteScore {
                    route: s.route.clone(),
                    score: s.score * 0.4 + user_score * 0.6,
                }
            })
            .collect();

        // Pick the highest blended score.
        let best = blended
            .iter()
            .max_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal))
            .cloned()
            .unwrap_or(RouteScore {
                route: "coder".to_string(),
                score: 0.5,
            });

        SemanticRoute {
            route: best.route.clone(),
            confidence: best.score,
            method: "hybrid".to_string(),
            scores: blended,
            model_tier: model_tier_for(&best.route).to_string(),
        }
    }

    /// Generate embedding for a text — delegates to upstream router.
    /// Returns `Vec<f64>` (converted from upstream `Vec<f32>`) for
    /// backwards compatibility with the previous keyword-based router
    /// that returned 8-dimensional `f64` vectors.
    pub fn embed(&self, text: &str) -> Vec<f64> {
        self.inner
            .embed(text)
            .into_iter()
            .map(|v| v as f64)
            .collect()
    }

    /// Stats about the router configuration. Returns JSON consumed by
    /// `proxy.rs::semantic_stats()` and forwarded as-is to TS.
    pub fn stats(&self) -> serde_json::Value {
        let total_keywords: usize = AGENT_TYPES
            .iter()
            .map(|name| keywords_for(name).len())
            .sum();
        json!({
            "num_agents": AGENT_TYPES.len(),
            "total_keywords": total_keywords,
            "use_embeddings": self.config.use_embeddings,
            "min_confidence": self.config.min_confidence,
            "embedding_dimensions": self.inner.dimensions(),
            "agents": AGENT_TYPES.iter().map(|name| {
                let kws = keywords_for(name);
                json!({
                    "name": name,
                    "model_tier": model_tier_for(name),
                    "keywords": kws.len(),
                    "patterns": 0,
                })
            }).collect::<Vec<_>>(),
        })
    }

    /// Return the full agent profile list as JSON.
    ///
    /// Consumed by the `q_table_seed` MCP tool to seed the Q-router
    /// with sensible initial values. The `keywords` array is derived
    /// from the upstream `keywords_for()` (which tokenizes the route
    /// description in aiyouvector-routing). The `patterns` array is
    /// empty — pattern matching is no longer used; the upstream
    /// router operates on embeddings.
    pub fn agent_profiles(&self) -> serde_json::Value {
        let profiles: Vec<serde_json::Value> = AGENT_TYPES
            .iter()
            .map(|name| {
                let kws: Vec<serde_json::Value> = keywords_for(name)
                    .iter()
                    .map(|(text, weight)| json!({ "text": text, "weight": weight }))
                    .collect();
                json!({
                    "name": name,
                    "model_tier": model_tier_for(name),
                    "keywords": kws,
                    "patterns": [],
                })
            })
            .collect();
        json!(profiles)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrapper_route_returns_embedding_method() {
        let r = SemanticRouter::new(None);
        let result = r.route("implement a login page with form validation");
        assert_eq!(result.method, "embedding");
        assert!(!result.scores.is_empty());
        assert!(!result.model_tier.is_empty());
    }

    #[test]
    fn wrapper_model_tier_matches_upstream() {
        let r = SemanticRouter::new(None);
        let result = r.route("design microservice architecture");
        // architect → opus
        assert_eq!(result.model_tier, "opus");
    }

    #[test]
    fn wrapper_route_with_embeddings_blends() {
        let r = SemanticRouter::new(None);
        let mut user_scores = HashMap::new();
        // Force the result to "tester" with a very high user score.
        user_scores.insert("tester".to_string(), 1.0);
        for name in AGENT_TYPES {
            if name != &"tester" {
                user_scores.insert(name.to_string(), 0.0);
            }
        }
        let result = r.route_with_embeddings("any task at all", user_scores);
        assert_eq!(result.method, "hybrid");
        // tester should win because user score is 1.0 and the upstream
        // score is at most 1.0 (cosine similarity), so blended ≥ 0.6.
        assert_eq!(result.route, "tester");
    }

    #[test]
    fn wrapper_embed_returns_f64_vector() {
        let r = SemanticRouter::new(None);
        let vec = r.embed("test text");
        assert!(!vec.is_empty());
        // All values should be finite (embedding model loaded).
        for v in &vec {
            assert!(v.is_finite());
        }
    }

    #[test]
    fn wrapper_stats_includes_all_agents() {
        let r = SemanticRouter::new(None);
        let stats = r.stats();
        let agents = stats["agents"].as_array().expect("agents array");
        assert_eq!(agents.len(), AGENT_TYPES.len());
        for name in AGENT_TYPES {
            let name_str = name.to_string();
            assert!(agents.iter().any(|a| a["name"] == name_str.as_str()));
        }
    }

    #[test]
    fn wrapper_agent_profiles_shape() {
        let r = SemanticRouter::new(None);
        let profiles = r.agent_profiles();
        let arr = profiles.as_array().expect("profiles array");
        assert_eq!(arr.len(), AGENT_TYPES.len());
        for p in arr {
            assert!(p.get("name").is_some());
            assert!(p.get("model_tier").is_some());
            assert!(p["keywords"].is_array());
            assert!(p["patterns"].is_array());
        }
    }

    #[test]
    fn wrapper_agent_profiles_keywords_nonempty() {
        let r = SemanticRouter::new(None);
        let profiles = r.agent_profiles();
        let arr = profiles.as_array().expect("profiles array");
        for p in arr {
            // Every profile must have at least one keyword for q_table_seed
            // to work. The upstream router derives keywords from the route
            // description, so each profile has multiple tokens.
            let keywords = p["keywords"].as_array().expect("keywords array");
            assert!(!keywords.is_empty(), "profile {} has no keywords", p["name"]);
        }
    }
}
