/// Response cache with TTL — caches LLM responses keyed by (model, messages hash).

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedResponse {
    pub response: serde_json::Value,
    pub created_at: u64,
    pub expires_at: u64,
    pub hits: u64,
}

pub struct ResponseCache {
    store: Mutex<HashMap<String, CachedResponse>>,
    default_ttl: Duration,
    max_entries: usize,
}

impl ResponseCache {
    pub fn new(default_ttl_secs: u64, max_entries: usize) -> Self {
        Self {
            store: Mutex::new(HashMap::new()),
            default_ttl: Duration::from_secs(default_ttl_secs),
            max_entries,
        }
    }

    /// Build a cache key from model + serialized messages.
    pub fn build_key(model: &str, messages: &[crate::llm::ChatMessage]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(model.as_bytes());
        for msg in messages {
            hasher.update(msg.role.as_bytes());
            hasher.update(msg.content.as_bytes());
        }
        let hash = hasher.finalize();
        format!("{}:{}", model, hex::encode(&hash))
    }

    /// Get a cached response if it exists and hasn't expired.
    pub fn get(&self, key: &str) -> Option<CachedResponse> {
        let mut store = self.store.lock();
        if let Some(entry) = store.get_mut(key) {
            let now = Instant::now().elapsed().as_secs();
            if now < entry.expires_at {
                entry.hits += 1;
                return Some(entry.clone());
            }
            // Expired — remove
            store.remove(key);
        }
        None
    }

    /// Store a response in the cache.
    pub fn set(&self, key: String, response: serde_json::Value, ttl_override: Option<Duration>) {
        let mut store = self.store.lock();
        let now = Instant::now().elapsed().as_secs();
        let ttl = ttl_override.unwrap_or(self.default_ttl);

        // Evict oldest if at capacity
        if store.len() >= self.max_entries {
            if let Some(oldest_key) = store.keys().next().cloned() {
                store.remove(&oldest_key);
            }
        }

        store.insert(
            key,
            CachedResponse {
                response,
                created_at: now,
                expires_at: now + ttl.as_secs(),
                hits: 0,
            },
        );
    }

    /// Invalidate a specific cache entry.
    pub fn invalidate(&self, key: &str) -> bool {
        self.store.lock().remove(key).is_some()
    }

    /// Clear all cached responses.
    pub fn clear(&self) {
        self.store.lock().clear();
    }

    /// Get cache statistics.
    pub fn stats(&self) -> serde_json::Value {
        let store = self.store.lock();
        let total_entries = store.len();
        let total_hits: u64 = store.values().map(|e| e.hits).sum();
        let avg_hits = if total_entries > 0 {
            total_hits as f64 / total_entries as f64
        } else {
            0.0
        };

        serde_json::json!({
            "entries": total_entries,
            "max_entries": self.max_entries,
            "total_hits": total_hits,
            "avg_hits_per_entry": format!("{:.2}", avg_hits),
            "default_ttl_secs": self.default_ttl.as_secs(),
        })
    }
}

/// Hex encoding since we don't want to add the `hex` crate as a dependency
mod hex {
    pub fn encode(bytes: &[u8]) -> String {
        const HEX_CHARS: &[u8] = b"0123456789abcdef";
        let mut result = vec![0u8; bytes.len() * 2];
        for (i, &byte) in bytes.iter().enumerate() {
            result[i * 2] = HEX_CHARS[(byte >> 4) as usize];
            result[i * 2 + 1] = HEX_CHARS[(byte & 0xf) as usize];
        }
        unsafe { String::from_utf8_unchecked(result) }
    }
}
