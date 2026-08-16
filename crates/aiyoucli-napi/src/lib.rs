#[macro_use]
extern crate napi_derive;

mod analysis;
mod ast;
mod attention;
mod cache;
mod codebase;
mod compressor;
mod detector;
mod distiller;
mod embeddings;
mod firewall;
mod graph;
mod llm;
mod proxy;
mod restrictions;
mod routing;
mod segmenter;
mod semantic;
mod shield;
mod sona;
mod vector;

pub const DEFAULT_GATEWAY_URL: &str = "http://127.0.0.1:8000/v1";
pub const DEFAULT_EMBED_URL: &str = "http://127.0.0.1:8001/v1";
