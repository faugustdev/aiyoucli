//! Semantic Router — routes tasks to agent types using pattern matching
//! and embedding-based similarity.
//!
//! Two modes:
//! 1. Built-in keyword router (fast, no model needed)
//! 2. Embedding-based router (uses ONNX model from models/)

use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct SemanticRoute {
    pub route: String,
    pub confidence: f64,
    pub method: String,
    pub scores: Vec<RouteScore>,
    pub model_tier: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouteScore {
    pub route: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RouterConfig {
    pub models_path: Option<String>,
    pub use_embeddings: bool,
    pub min_confidence: f64,
}

impl Default for RouterConfig {
    fn default() -> Self {
        Self {
            models_path: None,
            use_embeddings: false,
            min_confidence: 0.15,
        }
    }
}

// ── Agent type definitions with weighted keywords ────────────────

#[derive(Clone)]
struct AgentProfile {
    name: &'static str,
    model_tier: &'static str,
    keywords: &'static [(&'static str, f64)],
    patterns: &'static [&'static str],
}

const AGENT_PROFILES: &[AgentProfile] = &[
    AgentProfile {
        name: "coder",
        model_tier: "sonnet",
        keywords: &[
            ("implement", 0.9), ("code", 0.7), ("write", 0.5), ("create", 0.4),
            ("function", 0.8), ("class", 0.7), ("api", 0.6), ("endpoint", 0.6),
            ("feature", 0.6), ("module", 0.5), ("component", 0.5), ("middleware", 0.4),
            ("algorithm", 0.5), ("data structure", 0.5), ("refactor", 0.7),
            ("typescript", 0.5), ("javascript", 0.5), ("python", 0.5), ("rust", 0.5),
            ("frontend", 0.5), ("backend", 0.6), ("full stack", 0.4),
            ("authentication", 0.6), ("database", 0.5), ("schema", 0.5),
            ("migration", 0.4), ("query", 0.5), ("graphql", 0.5), ("rest", 0.5),
            ("controller", 0.5), ("service", 0.5), ("repository", 0.5),
        ],
        patterns: &[
            "implement", "code", "develop", "build", "program", "write.*function",
            "create.*api", "create.*endpoint", "add.*feature",
        ],
    },
    AgentProfile {
        name: "tester",
        model_tier: "haiku",
        keywords: &[
            ("test", 0.9), ("spec", 0.8), ("assertion", 0.7), ("mock", 0.6),
            ("stub", 0.5), ("fixture", 0.5), ("coverage", 0.6), ("unit test", 0.9),
            ("integration test", 0.8), ("e2e", 0.7), ("end-to-end", 0.6),
            ("testing", 0.8), ("jest", 0.6), ("vitest", 0.6), ("pytest", 0.6),
            ("selenium", 0.5), ("cypress", 0.5), ("playwright", 0.5),
            ("regression", 0.5), ("snapshot", 0.4), ("tdd", 0.6),
        ],
        patterns: &[
            "write.*test", "unit test", "integration test", "e2e.*test",
            "test.*coverage", "mock.*service", "test.*suite",
        ],
    },
    AgentProfile {
        name: "architect",
        model_tier: "opus",
        keywords: &[
            ("architecture", 0.9), ("design", 0.7), ("system", 0.6),
            ("microservice", 0.7), ("distributed", 0.7), ("scalable", 0.6),
            ("high-level", 0.6), ("infrastructure", 0.5), ("deployment", 0.5),
            ("pipeline", 0.5), ("ci/cd", 0.5), ("monolith", 0.4),
            ("event-driven", 0.6), ("cqrs", 0.5), ("event sourcing", 0.5),
            ("ddd", 0.6), ("domain", 0.5), ("bounded context", 0.5),
            ("diagram", 0.4), ("flow", 0.4), ("decision", 0.5),
            ("tech stack", 0.5), ("blueprint", 0.5), ("roadmap", 0.4),
        ],
        patterns: &[
            "system design", "architecture decision", "high.*level design",
            "distributed system", "microservice.*architecture",
            "technical.*specification",
        ],
    },
    AgentProfile {
        name: "reviewer",
        model_tier: "sonnet",
        keywords: &[
            ("review", 0.9), ("audit", 0.7), ("inspect", 0.5), ("check", 0.4),
            ("quality", 0.5), ("lint", 0.5), ("style", 0.4), ("convention", 0.5),
            ("best practice", 0.6), ("code review", 0.9), ("pull request", 0.7),
            ("pr", 0.5), ("standards", 0.5), ("compliance", 0.5),
            ("validate", 0.5), ("verify", 0.5),
        ],
        patterns: &[
            "code review", "pull request review", "audit.*code",
            "review.*pr", "check.*quality",
        ],
    },
    AgentProfile {
        name: "security",
        model_tier: "sonnet",
        keywords: &[
            ("security", 0.9), ("vulnerability", 0.9), ("exploit", 0.7),
            ("authentication", 0.6), ("authorization", 0.6), ("encryption", 0.7),
            ("xss", 0.7), ("sql injection", 0.8), ("csrf", 0.7),
            ("owasp", 0.7), ("penetration", 0.6), ("cve", 0.6),
            ("firewall", 0.5), ("access control", 0.6), ("rbac", 0.5),
            ("oauth", 0.5), ("jwt", 0.5), ("token", 0.4),
            ("audit", 0.6), ("compliance", 0.5), ("gdpr", 0.5),
            ("secure", 0.6), ("threat", 0.6), ("risk", 0.5),
            ("malware", 0.6), ("ransomware", 0.5),
        ],
        patterns: &[
            "security audit", "vulnerability.*scan", "penetration test",
            "security review", "access control",
        ],
    },
    AgentProfile {
        name: "debugger",
        model_tier: "sonnet",
        keywords: &[
            ("debug", 0.9), ("fix", 0.7), ("bug", 0.8), ("error", 0.6),
            ("crash", 0.6), ("exception", 0.6), ("stack trace", 0.7),
            ("issue", 0.5), ("problem", 0.5), ("broken", 0.5),
            ("regression", 0.5), ("incident", 0.5), ("outage", 0.5),
            ("log", 0.4), ("trace", 0.5), ("diagnose", 0.6),
            ("troubleshoot", 0.5), ("reproduce", 0.5), ("fail", 0.5),
            ("null", 0.4), ("undefined", 0.4), ("timeout", 0.4),
        ],
        patterns: &[
            "fix.*bug", "debug.*issue", "resolve.*error",
            "troubleshoot.*problem", "investigate.*crash",
        ],
    },
    AgentProfile {
        name: "documenter",
        model_tier: "haiku",
        keywords: &[
            ("documentation", 0.9), ("readme", 0.7), ("doc", 0.7),
            ("wiki", 0.5), ("guide", 0.5), ("tutorial", 0.5),
            ("changelog", 0.5), ("api doc", 0.6), ("swagger", 0.6),
            ("openapi", 0.6), ("comment", 0.4), ("annotate", 0.4),
            ("explain", 0.5), ("describe", 0.4), ("example", 0.4),
            ("usage", 0.4), ("setup", 0.4), ("how-to", 0.5),
        ],
        patterns: &[
            "write.*documentation", "create.*readme", "api.*documentation",
            "document.*code", "write.*guide",
        ],
    },
    AgentProfile {
        name: "researcher",
        model_tier: "sonnet",
        keywords: &[
            ("research", 0.9), ("investigate", 0.6), ("explore", 0.5),
            ("analyze", 0.6), ("study", 0.5), ("paper", 0.6),
            ("article", 0.4), ("understand", 0.4), ("learn", 0.4),
            ("comparison", 0.5), ("evaluate", 0.5), ("benchmark", 0.5),
            ("survey", 0.5), ("literature", 0.5), ("state of the art", 0.5),
            ("feasibility", 0.4), ("prototype", 0.4), ("poc", 0.4),
        ],
        patterns: &[
            "research.*topic", "investigate.*technology", "compare.*solution",
            "feasibility.*study", "literature.*review",
        ],
    },
];

pub struct SemanticRouter {
    config: RouterConfig,
    profiles: Vec<AgentProfile>,
}

impl SemanticRouter {
    pub fn new(config: Option<RouterConfig>) -> Self {
        Self {
            config: config.unwrap_or_default(),
            profiles: AGENT_PROFILES.to_vec(),
        }
    }

    /// Route a task description to the best agent type.
    pub fn route(&self, task: &str) -> SemanticRoute {
        let lower = task.to_lowercase();

        // Score each agent profile
        let mut scores: Vec<RouteScore> = self
            .profiles
            .iter()
            .map(|p| {
                let keyword_score = Self::score_keywords(&lower, p.keywords);
                let pattern_score = Self::score_patterns(&lower, p.patterns);
                let total = keyword_score * 0.7 + pattern_score * 0.3;
                RouteScore {
                    route: p.name.to_string(),
                    score: total,
                }
            })
            .collect();

        // Sort by score descending
        scores.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        let best_score = scores.first().map(|s| s.score).unwrap_or(0.0);
        let best_route = scores.first().map(|s| s.route.clone()).unwrap_or_else(|| "coder".to_string());

        // Determine model tier based on complexity
        let model_tier = if best_score > 0.6 {
            // Find the profile that matched
            self.profiles
                .iter()
                .find(|p| p.name == best_route)
                .map(|p| p.model_tier)
                .unwrap_or("sonnet")
        } else if best_score > 0.3 {
            "sonnet"
        } else {
            "haiku"
        };

        SemanticRoute {
            route: best_route,
            confidence: best_score,
            method: "keyword".to_string(),
            scores,
            model_tier: model_tier.to_string(),
        }
    }

    /// Route using external embedding scores (from ONNX model).
    pub fn route_with_embeddings(
        &self,
        task: &str,
        embedding_scores: HashMap<String, f64>,
    ) -> SemanticRoute {
        let keyword_route = self.route(task);

        // Blend embedding scores with keyword scores
        let blended: Vec<RouteScore> = keyword_route
            .scores
            .iter()
            .map(|s| {
                let embed_score = embedding_scores.get(&s.route).copied().unwrap_or(0.0);
                RouteScore {
                    route: s.route.clone(),
                    score: s.score * 0.4 + embed_score * 0.6,
                }
            })
            .collect();

        let mut sorted = blended.clone();
        sorted.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        let best = sorted.first().cloned().unwrap_or(RouteScore {
            route: "coder".to_string(),
            score: 0.5,
        });

        SemanticRoute {
            route: best.route,
            confidence: best.score,
            method: "hybrid".to_string(),
            scores: sorted,
            model_tier: keyword_route.model_tier,
        }
    }

    /// Generate embedding for a text (uses pre-computed vectors or keyword fallback).
    pub fn embed(&self, text: &str) -> Vec<f64> {
        // Simple keyword-based embedding: count occurrences of profile keywords
        let lower = text.to_lowercase();
        let mut vec = Vec::with_capacity(8);

        for profile in &self.profiles {
            let mut score = 0.0;
            for (kw, weight) in profile.keywords {
                if lower.contains(kw) {
                    score += weight;
                }
            }
            // Normalize by number of keywords
            let normalized = if !profile.keywords.is_empty() {
                score / profile.keywords.len() as f64
            } else {
                0.0
            };
            vec.push(normalized);
        }

        // L2 normalize
        let norm: f64 = vec.iter().map(|v| v * v).sum::<f64>().sqrt();
        if norm > 0.0 {
            for v in &mut vec {
                *v /= norm;
            }
        }

        vec
    }

    /// Get stats about the router configuration.
    pub fn stats(&self) -> serde_json::Value {
        let total_keywords: usize = self.profiles.iter().map(|p| p.keywords.len()).sum();
        serde_json::json!({
            "num_agents": self.profiles.len(),
            "total_keywords": total_keywords,
            "use_embeddings": self.config.use_embeddings,
            "min_confidence": self.config.min_confidence,
            "agents": self.profiles.iter().map(|p| serde_json::json!({
                "name": p.name,
                "model_tier": p.model_tier,
                "keywords": p.keywords.len(),
                "patterns": p.patterns.len(),
            })).collect::<Vec<_>>(),
        })
    }

    // ── Scorers ─────────────────────────────────────────────────

    fn score_keywords(text: &str, keywords: &[(&str, f64)]) -> f64 {
        let mut total = 0.0;
        let mut matched = 0.0;

        for (kw, weight) in keywords {
            if text.contains(kw) {
                total += weight;
                matched += 1.0;
            }
        }

        if keywords.is_empty() {
            return 0.0;
        }

        // Score: average of matched weights, boosted by coverage
        let avg_weight = total / keywords.len() as f64;
        let coverage = matched / keywords.len() as f64;

        avg_weight * (1.0 + coverage * 0.5)
    }

    fn score_patterns(text: &str, patterns: &[&str]) -> f64 {
        let mut score = 0.0;
        for pattern in patterns {
            // Convert glob-like pattern to regex
            let regex_str = pattern
                .replace('.', "\\.")
                .replace("*", ".*");
            if let Ok(re) = regex::Regex::new(&format!("(?i){}", regex_str)) {
                if re.is_match(text) {
                    score += 1.0;
                }
            }
        }
        if patterns.is_empty() {
            return 0.0;
        }
        score / patterns.len() as f64
    }
}
