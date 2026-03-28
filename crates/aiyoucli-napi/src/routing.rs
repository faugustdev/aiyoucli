//! NAPI wrapper for aiyouvector-routing.
//!
//! Thin bridge — all intelligence lives in aiyouvector-routing crate.
//! Combines Q-learning router with semantic router fallback.

use serde_json::json;

use aiyouvector_routing::{QRouter, SemanticRouter};

/// Task→Agent routing via Q-Learning + semantic embeddings + model tier selection.
#[napi]
pub struct RoutingEngine {
    q_router: QRouter,
    semantic: SemanticRouter,
}

#[napi]
impl RoutingEngine {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            q_router: QRouter::new(),
            semantic: SemanticRouter::new(),
        }
    }

    /// Route a task using Q-learning (if trained) or semantic similarity (fallback).
    #[napi]
    pub fn route(&self, task_description: String) -> serde_json::Value {
        let q_result = self.q_router.route(&task_description);

        // If Q-router has no learned state for this task, use semantic router
        let (route, confidence, method) = if q_result.alternatives.is_empty() {
            let sem = self.semantic.route(&task_description);
            (sem.route, sem.similarity, "semantic")
        } else {
            (q_result.route.clone(), q_result.confidence, if q_result.explored { "explore" } else { "q-learning" })
        };

        let model_tier = self.q_router.select_tier(&task_description).as_str().to_string();

        // Semantic scores as alternatives when Q-table is empty
        let alternatives = if q_result.alternatives.is_empty() {
            let sem = self.semantic.route(&task_description);
            sem.scores.iter().take(3).map(|(r, s)| json!({"route": r, "score": s})).collect::<Vec<_>>()
        } else {
            q_result.alternatives.iter().map(|a| json!({"route": a.route, "score": a.score})).collect()
        };

        json!({
            "route": route,
            "confidence": confidence,
            "model_tier": model_tier,
            "explored": q_result.explored,
            "method": method,
            "alternatives": alternatives,
        })
    }

    /// Record reward for a routing decision.
    #[napi]
    pub fn record_reward(
        &self,
        task_description: String,
        chosen_route: String,
        reward: f64,
    ) {
        self.q_router.record_reward(&task_description, &chosen_route, reward as f32);
    }

    /// Select model tier based on task complexity.
    #[napi]
    pub fn select_model_tier(&self, task_description: String) -> String {
        self.q_router.select_tier(&task_description).as_str().to_string()
    }

    /// Route using only semantic similarity (bypasses Q-learning).
    #[napi]
    pub fn semantic_route(&self, task_description: String) -> serde_json::Value {
        let result = self.semantic.route(&task_description);
        json!({
            "route": result.route,
            "similarity": result.similarity,
            "scores": result.scores.iter().map(|(r, s)| json!({"route": r, "score": s})).collect::<Vec<serde_json::Value>>(),
        })
    }

    /// Embed text into a vector (useful for vector memory integration).
    #[napi]
    pub fn embed(&self, text: String) -> Vec<f64> {
        self.semantic.embed(&text).into_iter().map(|v| v as f64).collect()
    }

    /// Get routing statistics.
    #[napi]
    pub fn stats(&self) -> serde_json::Value {
        let s = self.q_router.stats();
        json!({
            "states_learned": s.states_learned,
            "total_steps": s.total_steps,
            "num_actions": s.num_actions,
            "replay_buffer_size": s.replay_buffer_size,
            "replay_buffer_full": s.replay_buffer_full,
            "embedding_dimensions": self.semantic.dimensions(),
        })
    }

    /// Export Q-table as JSON string (for persistence).
    #[napi]
    pub fn export_q_table(&self) -> String {
        let snapshot = self.q_router.export_q_table();
        serde_json::to_string(&snapshot).unwrap_or_else(|_| "{}".to_string())
    }

    /// Import Q-table from JSON string (restore persisted state).
    #[napi]
    pub fn import_q_table(&self, json_str: String) {
        if let Ok(snapshot) = serde_json::from_str(&json_str) {
            self.q_router.import_q_table(snapshot);
        }
    }
}
