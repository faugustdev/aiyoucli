use std::collections::HashMap;

use napi::bindgen_prelude::*;
use serde_json::json;

// ── Classification patterns ─────────────────────────────────────

fn classify_by_path(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.contains("test") || lower.contains("spec") || lower.contains("__tests__") {
        "test"
    } else if lower.ends_with(".md") || lower.contains("readme") || lower.contains("doc") {
        "docs"
    } else if lower.contains("config") || lower.contains("package.json") || lower.contains("tsconfig") || lower.contains(".env") {
        "config"
    } else {
        ""
    }
}

fn classify_by_content(content: &str) -> &'static str {
    let lower = content.to_lowercase();
    if lower.contains("fix") || lower.contains("bug") || lower.contains("error") || lower.contains("issue") {
        "bugfix"
    } else if lower.contains("feat") || lower.contains("add") || lower.contains("implement") || lower.contains("new") {
        "feature"
    } else {
        ""
    }
}

fn impact_score(path: &str) -> u32 {
    let lower = path.to_lowercase();
    if lower.contains("security") || lower.contains("auth") || lower.contains("payment") {
        3
    } else if lower.contains("database") || lower.contains("api") || lower.contains("core") {
        2
    } else if lower.contains("util") || lower.contains("helper") {
        1
    } else if lower.contains("test") || lower.contains("mock") || lower.contains("fixture") {
        0
    } else {
        1
    }
}

// ── Diff Analysis Engine ────────────────────────────────────────

/// Code analysis engine — diff classification, complexity scoring, impact assessment.
#[napi]
pub struct AnalysisEngine;

#[napi]
impl AnalysisEngine {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self
    }

    /// Classify a git diff string. Returns JSON analysis.
    #[napi]
    pub fn classify_diff(&self, diff_content: String) -> serde_json::Value {
        let files = parse_diff(&diff_content);

        let mut total_additions = 0u32;
        let mut total_deletions = 0u32;
        let mut max_impact = 0u32;
        let mut type_counts: HashMap<String, u32> = HashMap::new();
        let mut risk_factors: Vec<String> = Vec::new();

        let file_results: Vec<serde_json::Value> = files
            .iter()
            .map(|f| {
                total_additions += f.additions;
                total_deletions += f.deletions;
                let impact = impact_score(&f.path);
                if impact > max_impact {
                    max_impact = impact;
                }

                let classification = classify_file(&f.path, &f.content);
                *type_counts.entry(classification.to_string()).or_default() += 1;

                // Risk factors
                if f.additions + f.deletions > 200 {
                    risk_factors.push(format!("Large change in {}: {} lines", f.path, f.additions + f.deletions));
                }
                if impact >= 3 {
                    risk_factors.push(format!("High-impact file: {}", f.path));
                }

                json!({
                    "path": f.path,
                    "additions": f.additions,
                    "deletions": f.deletions,
                    "classification": classification,
                    "impact": match impact { 0 => "none", 1 => "low", 2 => "medium", _ => "high" },
                })
            })
            .collect();

        // Overall classification: most common type
        let overall_type = type_counts
            .iter()
            .max_by_key(|(_, &count)| count)
            .map(|(t, _)| t.as_str())
            .unwrap_or("unknown");

        let impact_level = match max_impact {
            0 => "low",
            1 => "low",
            2 => "medium",
            _ => "high",
        };

        // Is this a refactoring? (similar adds and deletes)
        if total_additions > 5 && total_deletions > 5 {
            let ratio = total_deletions as f32 / total_additions as f32;
            if (0.7..1.4).contains(&ratio) && overall_type == "unknown" {
                risk_factors.push("Possible refactoring (balanced add/delete ratio)".into());
            }
        }

        risk_factors.dedup();

        json!({
            "files": file_results,
            "overall": {
                "classification": overall_type,
                "impact": impact_level,
                "confidence": if files.is_empty() { 0.0 } else { 0.7 },
            },
            "stats": {
                "total_additions": total_additions,
                "total_deletions": total_deletions,
                "files_changed": files.len(),
            },
            "risk_factors": risk_factors,
        })
    }

    /// Classify a commit message. Returns the change type.
    #[napi]
    pub fn classify_commit(&self, message: String) -> String {
        let lower = message.to_lowercase();

        // Priority 1: conventional commit prefixes (exact match)
        if lower.starts_with("fix") { return "bugfix".into(); }
        if lower.starts_with("feat") { return "feature".into(); }
        if lower.starts_with("refactor") { return "refactor".into(); }
        if lower.starts_with("test") { return "test".into(); }
        if lower.starts_with("doc") { return "docs".into(); }
        if lower.starts_with("style") { return "style".into(); }
        if lower.starts_with("config") || lower.starts_with("ci") || lower.starts_with("build") {
            return "config".into();
        }

        // Priority 2: keyword matching
        if lower.contains("bug") || lower.contains("patch") { return "bugfix".into(); }
        if lower.contains("add") || lower.contains("implement") { return "feature".into(); }
        if lower.contains("restructure") || lower.contains("cleanup") { return "refactor".into(); }
        if lower.contains("spec") { return "test".into(); }
        if lower.contains("readme") { return "docs".into(); }
        if lower.contains("format") || lower.contains("lint") { return "style".into(); }

        "unknown".into()
    }

    /// Score code complexity from source content.
    /// Returns a 0.0-1.0 score where higher = more complex.
    #[napi]
    pub fn complexity_score(&self, source: String) -> f64 {
        let lines: Vec<&str> = source.lines().collect();
        let total_lines = lines.len() as f64;
        if total_lines == 0.0 {
            return 0.0;
        }

        let mut nesting_depth: i32 = 0;
        let mut max_nesting: i32 = 0;
        let mut branch_count: u32 = 0;
        let mut function_count: u32 = 0;

        for line in &lines {
            let trimmed = line.trim();

            // Nesting
            nesting_depth += trimmed.matches('{').count() as i32;
            nesting_depth -= trimmed.matches('}').count() as i32;
            if nesting_depth > max_nesting {
                max_nesting = nesting_depth;
            }

            // Branches (cyclomatic complexity proxy)
            if trimmed.starts_with("if ")
                || trimmed.starts_with("else ")
                || trimmed.starts_with("case ")
                || trimmed.starts_with("for ")
                || trimmed.starts_with("while ")
                || trimmed.contains("? ")
                || trimmed.contains("catch")
                || trimmed.contains("&&")
                || trimmed.contains("||")
            {
                branch_count += 1;
            }

            // Functions
            if trimmed.contains("function ")
                || trimmed.contains("fn ")
                || trimmed.contains("def ")
                || trimmed.contains("=> {")
                || (trimmed.contains("(") && trimmed.contains(") {"))
            {
                function_count += 1;
            }
        }

        // Normalize to 0-1
        let line_score = (total_lines / 500.0).min(1.0);
        let nesting_score = (max_nesting as f64 / 8.0).min(1.0);
        let branch_score = (branch_count as f64 / 30.0).min(1.0);
        let function_score = (function_count as f64 / 20.0).min(1.0);

        // Weighted average
        let score =
            line_score * 0.2 + nesting_score * 0.3 + branch_score * 0.3 + function_score * 0.2;

        (score * 100.0).round() / 100.0
    }
}

// ── Diff parser ─────────────────────────────────────────────────

struct ParsedFile {
    path: String,
    content: String,
    additions: u32,
    deletions: u32,
}

fn parse_diff(diff: &str) -> Vec<ParsedFile> {
    let mut files = Vec::new();

    for block in diff.split("diff --git").skip(1) {
        // Extract file path
        let path = block
            .lines()
            .next()
            .and_then(|l| {
                let parts: Vec<&str> = l.split_whitespace().collect();
                parts.last().map(|p| p.trim_start_matches("b/").to_string())
            })
            .unwrap_or_default();

        if path.is_empty() {
            continue;
        }

        let mut additions = 0u32;
        let mut deletions = 0u32;
        let mut content = String::new();

        for line in block.lines() {
            if line.starts_with('+') && !line.starts_with("+++") {
                additions += 1;
                content.push_str(&line[1..]);
                content.push('\n');
            } else if line.starts_with('-') && !line.starts_with("---") {
                deletions += 1;
            }
        }

        files.push(ParsedFile {
            path,
            content,
            additions,
            deletions,
        });
    }

    files
}

fn classify_file(path: &str, content: &str) -> &'static str {
    let by_path = classify_by_path(path);
    if !by_path.is_empty() {
        return by_path;
    }
    let by_content = classify_by_content(content);
    if !by_content.is_empty() {
        return by_content;
    }
    "unknown"
}
