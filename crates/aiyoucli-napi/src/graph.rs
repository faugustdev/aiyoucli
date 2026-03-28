use std::sync::Arc;

use napi::bindgen_prelude::*;
use parking_lot::RwLock;

use aiyouvector_graph::{
    types::{Direction, EdgeKind, NodeKind},
    KnowledgeGraph, KnowledgeNodeBuilder,
};

/// NAPI handle to the knowledge graph.
#[napi]
pub struct GraphHandle {
    graph: Arc<RwLock<KnowledgeGraph>>,
}

#[napi]
impl GraphHandle {
    /// Create a new empty knowledge graph.
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            graph: Arc::new(RwLock::new(KnowledgeGraph::new())),
        }
    }

    /// Add a node. Returns its ID.
    ///
    /// kind: "technology" | "project" | "pattern" | "decision" | "file" | "function" | "concept"
    #[napi]
    pub fn add_node(&self, kind: String, name: String) -> u32 {
        let nk = parse_node_kind(&kind);
        let builder = KnowledgeNodeBuilder::new(nk, &name);
        self.graph.write().add_node(builder) as u32
    }

    /// Add a directed edge between two nodes. Returns edge ID.
    ///
    /// kind: "knows" | "works_on" | "applies" | "used_in" | "relates_to" | "depends_on" | "calls" | "imports"
    #[napi]
    pub fn add_edge(&self, from: u32, to: u32, kind: String, weight: f64) -> Result<u32> {
        let ek = parse_edge_kind(&kind);
        self.graph
            .write()
            .add_edge(from as u64, to as u64, ek, weight as f32)
            .map(|id| id as u32)
            .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))
    }

    /// Get a node by ID. Returns JSON or null.
    #[napi]
    pub fn get_node(&self, id: u32) -> Option<serde_json::Value> {
        self.graph.read().get_node(id as u64).map(|n| {
            serde_json::json!({
                "id": n.id,
                "name": n.name,
                "kind": format!("{:?}", n.kind),
            })
        })
    }

    /// Get neighbors of a node.
    ///
    /// direction: "outgoing" | "incoming" | "both"
    #[napi]
    pub fn neighbors(&self, id: u32, direction: Option<String>) -> serde_json::Value {
        let dir = match direction.as_deref() {
            Some("incoming") => Direction::Incoming,
            Some("both") => Direction::Both,
            _ => Direction::Outgoing,
        };

        let results = self.graph.read().neighbors(id as u64, dir);
        let items: Vec<serde_json::Value> = results
            .iter()
            .map(|(edge, node)| {
                serde_json::json!({
                    "node_id": node.id,
                    "node_name": node.name,
                    "node_kind": format!("{:?}", node.kind),
                    "edge_kind": format!("{:?}", edge.kind),
                    "weight": edge.weight,
                })
            })
            .collect();
        serde_json::json!(items)
    }

    /// K-hop neighborhood (BFS). Returns array of node IDs.
    #[napi]
    pub fn k_hop(&self, start: u32, k: u32) -> Vec<u32> {
        self.graph
            .read()
            .k_hop(start as u64, k as usize)
            .into_iter()
            .map(|id| id as u32)
            .collect()
    }

    /// Remove a node and all its edges.
    #[napi]
    pub fn remove_node(&self, id: u32) -> Result<bool> {
        self.graph
            .write()
            .remove_node(id as u64)
            .map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))
    }

    /// Get graph statistics.
    #[napi]
    pub fn stats(&self) -> serde_json::Value {
        let g = self.graph.read();
        serde_json::json!({
            "nodes": g.node_count(),
            "edges": g.edge_count(),
        })
    }
}

fn parse_node_kind(s: &str) -> NodeKind {
    match s.to_lowercase().as_str() {
        "technology" => NodeKind::Technology,
        "project" => NodeKind::Project,
        "pattern" => NodeKind::Pattern,
        "decision" => NodeKind::Decision,
        "file" => NodeKind::File,
        "function" => NodeKind::Function,
        _ => NodeKind::Concept,
    }
}

fn parse_edge_kind(s: &str) -> EdgeKind {
    match s.to_lowercase().as_str() {
        "knows" => EdgeKind::Knows,
        "works_on" => EdgeKind::WorksOn,
        "applies" => EdgeKind::Applies,
        "decided" => EdgeKind::Decided,
        "used_in" => EdgeKind::UsedIn,
        "observed_in" => EdgeKind::ObservedIn,
        "evolved_from" => EdgeKind::EvolvedFrom,
        "calls" => EdgeKind::Calls,
        "imports" => EdgeKind::Imports,
        "depends_on" => EdgeKind::DependsOn,
        _ => EdgeKind::RelatesTo,
    }
}
