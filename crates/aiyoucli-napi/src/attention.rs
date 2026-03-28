use napi::bindgen_prelude::*;

use aiyouvector_attention::{AttentionHint, AttentionRouter};

/// NAPI handle to the attention routing engine.
#[napi]
pub struct AttentionHandle {
    router: AttentionRouter,
}

#[napi]
impl AttentionHandle {
    /// Create a new attention router for the given dimension.
    #[napi(constructor)]
    pub fn new(dim: u32) -> Self {
        Self {
            router: AttentionRouter::new(dim as usize),
        }
    }

    /// Compute attention over keys/values for a query.
    ///
    /// hint: "auto" | "flat" | "hierarchical" | "broad"
    /// keys and values are flat arrays that get chunked by dim.
    #[napi]
    pub fn compute(
        &self,
        query: Vec<f64>,
        keys_flat: Vec<f64>,
        values_flat: Vec<f64>,
        hint: Option<String>,
    ) -> Result<Vec<f64>> {
        let dim = query.len();
        if dim == 0 {
            return Err(Error::new(Status::InvalidArg, "Empty query"));
        }

        let q: Vec<f32> = query.iter().map(|&v| v as f32).collect();

        // Chunk flat arrays into slices of dim
        let keys_f32: Vec<Vec<f32>> = keys_flat
            .chunks(dim)
            .map(|c| c.iter().map(|&v| v as f32).collect())
            .collect();
        let values_f32: Vec<Vec<f32>> = values_flat
            .chunks(dim)
            .map(|c| c.iter().map(|&v| v as f32).collect())
            .collect();

        let keys_refs: Vec<&[f32]> = keys_f32.iter().map(|v| v.as_slice()).collect();
        let values_refs: Vec<&[f32]> = values_f32.iter().map(|v| v.as_slice()).collect();

        let h = match hint.as_deref() {
            Some("flat") => AttentionHint::FlatSearch,
            Some("hierarchical") => AttentionHint::Hierarchical,
            Some("broad") => AttentionHint::BroadScan,
            _ => AttentionHint::Auto,
        };

        let result = self
            .router
            .compute(&q, &keys_refs, &values_refs, h)
            .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))?;

        Ok(result.iter().map(|&v| v as f64).collect())
    }
}
