#[macro_use]
extern crate napi_derive;

mod analysis;
mod ast;
mod attention;
mod cache;
// `#[napi]` on free functions (unlike `#[napi] impl` used by vector.rs/
// graph.rs/proxy.rs) doesn't keep them "used" for dead_code purposes in
// `cargo test` builds — the real napi build is unaffected since `#[no_mangle]`
// ABI symbols are exempt from the lint regardless. Real code, real callers
// (JS), just not visible from `cargo test`'s reachability graph.
#[cfg_attr(test, allow(dead_code))]
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
