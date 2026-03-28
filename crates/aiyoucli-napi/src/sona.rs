use std::sync::Arc;

use napi::bindgen_prelude::*;
use parking_lot::Mutex;

use aiyouvector_profile::{Observation, ObservationKind, ObservationQuality};
use aiyouvector_sona::DevSonaEngine;

/// NAPI handle to the SONA self-learning engine.
#[napi]
pub struct SonaHandle {
    engine: Arc<Mutex<DevSonaEngine>>,
}

#[napi]
impl SonaHandle {
    /// Create a new SONA engine with default config.
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            engine: Arc::new(Mutex::new(DevSonaEngine::new())),
        }
    }

    /// Submit an observation for learning.
    /// The engine does instant micro-adaptation (Loop A) on each observation.
    #[napi]
    pub fn submit_observation(
        &self,
        embedding: Vec<f64>,
        quality_score: f64,
        kind: Option<String>,
    ) -> Result<()> {
        let emb_f32: Vec<f32> = embedding.iter().map(|&v| v as f32).collect();

        let obs_kind = match kind.as_deref() {
            Some("commit") => ObservationKind::GitCommit {
                message: String::new(),
                files_changed: 0,
            },
            Some("test") => ObservationKind::TestResult {
                passed: quality_score > 0.5,
                test_count: 1,
            },
            _ => ObservationKind::FileModified {
                path: String::new(),
                language: String::new(),
                diff_lines: 0,
            },
        };

        let obs = Observation {
            kind: obs_kind,
            embedding: emb_f32,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            project_hash: 0,
            content: String::new(),
            quality: ObservationQuality {
                score: quality_score as f32,
                ..Default::default()
            },
        };

        self.engine.lock().submit_observation(&obs);
        Ok(())
    }

    /// Transform an embedding through the learned LoRA weights.
    #[napi]
    pub fn transform_embedding(&self, input: Vec<f64>) -> Vec<f64> {
        let input_f32: Vec<f32> = input.iter().map(|&v| v as f32).collect();
        let mut output_f32 = vec![0.0_f32; input_f32.len()];
        self.engine
            .lock()
            .transform_embedding(&input_f32, &mut output_f32);
        output_f32.iter().map(|&v| v as f64).collect()
    }

    /// Force background learning (Loop B).
    #[napi]
    pub fn force_learn(&self) -> u32 {
        let result = self.engine.lock().force_learn();
        result.trajectories_processed as u32
    }

    /// Get engine statistics.
    #[napi]
    pub fn stats(&self) -> serde_json::Value {
        let s = self.engine.lock().stats();
        serde_json::json!({
            "signals_processed": s.signals_processed,
            "trajectories_buffered": s.trajectories_buffered,
            "enabled": s.enabled,
        })
    }

    /// Enable or disable the engine.
    #[napi]
    pub fn set_enabled(&self, enabled: bool) {
        self.engine.lock().set_enabled(enabled);
    }
}
