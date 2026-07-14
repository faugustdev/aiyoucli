#[macro_use]
extern crate napi_derive;

#[napi]
pub fn rd_get_strategies() -> Vec<String> {
  vec![
    "langgraph-agent".into(),
    "source-based".into(),
    "focused-iteration".into(),
    "topic-organization".into(),
    "quick".into(),
  ]
}

#[napi]
pub fn rd_create_session(query: String, strategy: Option<String>) -> String {
  let strat = strategy.unwrap_or_else(|| "langgraph-agent".into());
  format!(
    r#"{{"sessionId":"rd-{}","query":"{}","strategy":"{}","status":"initialized"}}"#,
    simple_hash(&query),
    query.replace('"', "\\\""),
    strat
  )
}

#[napi]
pub fn rd_search_web(query: String, engine: Option<String>) -> String {
  let eng = engine.unwrap_or_else(|| "searxng".into());
  format!(
    r#"{{"query":"{}","engine":"{}","status":"queued"}}"#,
    query.replace('"', "\\\""),
    eng
  )
}

#[napi]
pub fn rd_process_document(path: String) -> String {
  format!(
    r#"{{"path":"{}","status":"queued","format":"markdown"}}"#,
    path.replace('"', "\\\"")
  )
}

fn simple_hash(s: &str) -> String {
  use std::collections::hash_map::DefaultHasher;
  use std::hash::{Hash, Hasher};
  let mut h = DefaultHasher::new();
  s.hash(&mut h);
  format!("{:x}", h.finish())
}
