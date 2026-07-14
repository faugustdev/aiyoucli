#[macro_use]
extern crate napi_derive;

pub mod ast;
pub mod cache;
pub mod compressor;
pub mod embeddings;
pub mod firewall;
pub mod llm;
mod napi;
pub mod restrictions;
pub mod segmenter;
pub mod semantic;
pub mod shield;

// Re-export main types for convenience
pub use ast::Analyzer;
pub use cache::ResponseCache;
pub use compressor::Compressor;
pub use embeddings::Embedder;
pub use firewall::Firewall;
pub use llm::{LlmProvider, ProviderKind, ProviderConfig};
pub use restrictions::Restrictions;
pub use segmenter::Segmenter;
pub use semantic::SemanticRouter;
pub use shield::Shield;

/// Default local gateway URL for the Custom provider
pub const DEFAULT_GATEWAY_URL: &str = "http://127.0.0.1:8000/v1";

/// Default local embeddings gateway URL (all-MiniLM-L6-v2 ONNX server)
pub const DEFAULT_EMBED_URL: &str = "http://127.0.0.1:8001/v1";
