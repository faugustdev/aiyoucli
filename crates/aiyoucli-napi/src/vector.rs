use std::collections::HashMap;
use std::sync::Arc;

use napi::bindgen_prelude::*;
use parking_lot::Mutex;

use aiyouvector_core::types::{
    DbConfig, DistanceMetric, HnswConfig, QuantizationConfig, SearchQuery, VectorEntry,
};
use aiyouvector_core::VectorDB;

/// Shared handle to a VectorDB instance, safe to pass across NAPI boundary.
#[napi]
pub struct VectorHandle {
    db: Arc<Mutex<VectorDB>>,
}

#[napi]
impl VectorHandle {
    /// Open a persistent vector database at the given path.
    #[napi(factory)]
    pub fn open(path: String, dimensions: Option<u32>) -> Result<Self> {
        let dims = dimensions.unwrap_or(384) as usize;
        let config = DbConfig {
            dimensions: dims,
            metric: DistanceMetric::Cosine,
            storage_path: Some(path),
            hnsw: Some(HnswConfig::default()),
            quantization: QuantizationConfig::None,
        };

        let db = VectorDB::open(config).map_err(|e| {
            Error::new(Status::GenericFailure, format!("Failed to open VectorDB: {e}"))
        })?;

        Ok(Self {
            db: Arc::new(Mutex::new(db)),
        })
    }

    /// Create an in-memory vector database (no persistence).
    /// HNSW index is enabled by default for better search performance.
    #[napi(factory)]
    pub fn in_memory(dimensions: Option<u32>, enable_hnsw: Option<bool>) -> Result<Self> {
        let dims = dimensions.unwrap_or(384) as usize;
        let use_hnsw = enable_hnsw.unwrap_or(true);
        let config = DbConfig {
            dimensions: dims,
            metric: DistanceMetric::Cosine,
            storage_path: None,
            hnsw: if use_hnsw { Some(HnswConfig::default()) } else { None },
            quantization: QuantizationConfig::None,
        };

        let db = VectorDB::in_memory(config).map_err(|e| {
            Error::new(Status::GenericFailure, format!("Failed to create in-memory DB: {e}"))
        })?;

        Ok(Self {
            db: Arc::new(Mutex::new(db)),
        })
    }

    /// Insert a vector with optional ID and metadata. Returns the assigned ID.
    #[napi]
    pub fn insert(
        &self,
        vector: Vec<f64>,
        id: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<String> {
        let vector_f32: Vec<f32> = vector.iter().map(|&v| v as f32).collect();

        let meta: Option<HashMap<String, serde_json::Value>> = metadata
            .and_then(|v| serde_json::from_value(v).ok());

        let entry = VectorEntry {
            id,
            vector: vector_f32,
            metadata: meta,
        };

        self.db
            .lock()
            .insert(entry)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Insert failed: {e}")))
    }

    /// Search for the k nearest vectors. Returns JSON array of results.
    #[napi]
    pub fn search(&self, vector: Vec<f64>, k: Option<u32>) -> Result<serde_json::Value> {
        let vector_f32: Vec<f32> = vector.iter().map(|&v| v as f32).collect();

        let query = SearchQuery {
            vector: vector_f32,
            k: k.unwrap_or(5) as usize,
            ef_search: None,
            use_quantization: None,
            filter: None,
        };

        let results = self
            .db
            .lock()
            .search(query)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Search failed: {e}")))?;

        serde_json::to_value(&results)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Serialize failed: {e}")))
    }

    /// Delete a vector by ID. Returns true if found and deleted.
    #[napi]
    pub fn delete(&self, id: String) -> Result<bool> {
        self.db
            .lock()
            .delete(&id)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Delete failed: {e}")))
    }

    /// Get the number of vectors in the database.
    #[napi]
    pub fn count(&self) -> u32 {
        self.db.lock().count() as u32
    }

    /// Get database statistics as JSON.
    #[napi]
    pub fn stats(&self) -> Result<serde_json::Value> {
        let stats = self
            .db
            .lock()
            .stats()
            .map_err(|e| Error::new(Status::GenericFailure, format!("Stats failed: {e}")))?;

        serde_json::to_value(&stats)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Serialize failed: {e}")))
    }
}
