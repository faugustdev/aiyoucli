//! Multi-language code analyzer — extracts AST-like structure from source code.
//!
//! Thin wrapper over `aiyouvector_codebase::indexer::tree_sitter` and
//! `aiyouvector_codebase::indexer::symbols`. The previous version of
//! this file (868 lines) reimplemented parsing and symbol extraction
//! for 6 languages with regex/line-scanning heuristics. The new
//! version delegates parsing to the tree-sitter grammars already
//! shipped in aiyouvector-codebase (19 languages supported).
//!
//! Pillar C (Pillar C — Cerrar la duplicación con aiyoucli) consolidates
//! AST intelligence in aiyouvector-codebase. This file is now a
//! translation layer that maps `Symbol` (upstream) to the legacy
//! `FunctionDecl` / `ClassDecl` / `ImportDecl` shapes consumed by
//! `proxy.rs` and the MCP `ast` tool via `src/napi/proxy.ts`.
//!
//! The public API surface (consumed by `proxy.rs`) is preserved:
//!   - `Language::from_filename(path)`
//!   - `Analyzer::analyze(path, source) -> AnalysisResult`
//!   - `Analyzer::analyze_batch(files) -> BatchAnalysisResult`
//! and the JSON output fields are identical, so `src/napi/proxy.ts`
//! needs no changes.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use tempfile::NamedTempFile;

use aiyouvector_codebase::graph::{NodeKind, Symbol};
use aiyouvector_codebase::indexer::symbols::extract_symbols;
use aiyouvector_codebase::indexer::tree_sitter::{language_for_extension, parse_file};

// ── Language detection ───────────────────────────────────────────

/// Languages the upstream `aiyouvector-codebase` knows about. The
/// `Language` enum is kept for API compatibility with the previous
/// implementation but now covers all 19 tree-sitter grammars shipped
/// by the upstream crate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Language {
    JavaScript,
    TypeScript,
    Python,
    Rust,
    Go,
    Java,
    C,
    Cpp,
    CSharp,
    Ruby,
    Php,
    Scala,
    Yaml,
    Json,
    Markdown,
    Html,
    Css,
    Bash,
    Unknown,
}

impl Language {
    pub fn from_filename(path: &str) -> Self {
        let lower = path.to_lowercase();
        let ext = lower.rsplit('.').next().unwrap_or("");
        match ext {
            "js" | "jsx" | "mjs" | "cjs" => Language::JavaScript,
            "ts" | "tsx" | "mts" => Language::TypeScript,
            "py" => Language::Python,
            "rs" => Language::Rust,
            "go" => Language::Go,
            "java" | "kt" => Language::Java,
            "c" | "h" => Language::C,
            "cpp" | "cc" | "cxx" | "hpp" => Language::Cpp,
            "cs" => Language::CSharp,
            "rb" => Language::Ruby,
            "php" => Language::Php,
            "scala" => Language::Scala,
            "yaml" | "yml" => Language::Yaml,
            "json" => Language::Json,
            "md" => Language::Markdown,
            "html" | "htm" => Language::Html,
            "css" => Language::Css,
            "sh" | "bash" => Language::Bash,
            _ => Language::Unknown,
        }
    }

    /// Short identifier (e.g. "rust", "typescript") suitable for the
    /// `language` field of `AnalysisResult`. Falls back to the
    /// `Debug` name for `Unknown`.
    pub fn short_name(&self) -> &'static str {
        match self {
            Language::JavaScript => "javascript",
            Language::TypeScript => "typescript",
            Language::Python => "python",
            Language::Rust => "rust",
            Language::Go => "go",
            Language::Java => "java",
            Language::C => "c",
            Language::Cpp => "cpp",
            Language::CSharp => "c_sharp",
            Language::Ruby => "ruby",
            Language::Php => "php",
            Language::Scala => "scala",
            Language::Yaml => "yaml",
            Language::Json => "json",
            Language::Markdown => "markdown",
            Language::Html => "html",
            Language::Css => "css",
            Language::Bash => "bash",
            Language::Unknown => "unknown",
        }
    }

    #[allow(dead_code)]
    pub fn extensions(&self) -> &[&str] {
        match self {
            Language::JavaScript => &["js", "jsx", "mjs", "cjs"],
            Language::TypeScript => &["ts", "tsx", "mts"],
            Language::Python => &["py"],
            Language::Rust => &["rs"],
            Language::Go => &["go"],
            Language::Java => &["java", "kt"],
            Language::C => &["c", "h"],
            Language::Cpp => &["cpp", "cc", "cxx", "hpp"],
            Language::CSharp => &["cs"],
            Language::Ruby => &["rb"],
            Language::Php => &["php"],
            Language::Scala => &["scala"],
            Language::Yaml => &["yaml", "yml"],
            Language::Json => &["json"],
            Language::Markdown => &["md"],
            Language::Html => &["html", "htm"],
            Language::Css => &["css"],
            Language::Bash => &["sh", "bash"],
            Language::Unknown => &[],
        }
    }
}

// ── AST Node types (preserved for backwards compatibility) ────────

#[derive(Debug, Clone, Serialize)]
pub struct FunctionDecl {
    pub name: String,
    pub start_line: usize,
    pub end_line: usize,
    pub params: Vec<String>,
    pub complexity: f64,
    pub has_doc_comment: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClassDecl {
    pub name: String,
    pub start_line: usize,
    pub end_line: usize,
    pub methods: Vec<FunctionDecl>,
    pub parent_class: Option<String>,
    pub interfaces: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportDecl {
    pub source: String,
    pub names: Vec<String>,
    pub kind: String, // "named", "default", "side_effect", "require"
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalysisResult {
    pub language: String,
    pub functions: Vec<FunctionDecl>,
    pub classes: Vec<ClassDecl>,
    pub imports: Vec<ImportDecl>,
    pub total_lines: usize,
    pub comment_lines: usize,
    pub blank_lines: usize,
    pub code_lines: usize,
    pub overall_complexity: f64,
    pub max_nesting_depth: usize,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BatchAnalysisResult {
    pub files: Vec<AnalysisResult>,
    pub total_files: usize,
    pub total_functions: usize,
    pub total_classes: usize,
    pub avg_complexity: f64,
    pub languages: Vec<String>,
}

// ── Analyzer ─────────────────────────────────────────────────────

pub struct Analyzer;

impl Analyzer {
    /// Analyze a single source file.
    ///
    /// `path` is used for language detection and as a hint for the
    /// tree-sitter grammar. `source` is the actual file content. The
    /// source is written to a temporary file so that the upstream
    /// `parse_file` (which expects a `Path`) can read it. The temp
    /// file is cleaned up on drop.
    pub fn analyze(path: &str, source: &str) -> AnalysisResult {
        let language = Language::from_filename(path);
        let lines: Vec<&str> = source.lines().collect();
        let total_lines = lines.len();

        let (blank_lines, comment_lines) = count_lines(&lines, language);
        let code_lines = total_lines.saturating_sub(blank_lines + comment_lines);
        let max_nesting = max_nesting_depth(&lines);

        // Parse with tree-sitter via the upstream crate. The temp file
        // lives only for the duration of this call; downstream code
        // (NAPI bridge) does not need to hold onto the path.
        let (functions, classes, imports, overall_complexity) =
            extract_via_treesitter(path, source, &functions_complexity_for_language(language));

        let mut dependencies: Vec<String> = Vec::new();
        for imp in &imports {
            if !dependencies.contains(&imp.source) {
                dependencies.push(imp.source.clone());
            }
        }

        AnalysisResult {
            language: language.short_name().to_string(),
            functions,
            classes,
            imports,
            total_lines,
            comment_lines,
            blank_lines,
            code_lines,
            overall_complexity,
            max_nesting_depth: max_nesting,
            dependencies,
        }
    }

    /// Analyze multiple files with language detection.
    pub fn analyze_batch(files: Vec<(String, String)>) -> BatchAnalysisResult {
        let mut results = Vec::new();
        let mut total_functions = 0;
        let mut total_classes = 0;
        let mut sum_complexity = 0.0;
        let mut languages_set: Vec<String> = Vec::new();

        for (path, source) in files {
            let result = Self::analyze(&path, &source);
            total_functions += result.functions.len();
            total_classes += result.classes.len();
            sum_complexity += result.overall_complexity;
            let lang = result.language.clone();
            if !languages_set.contains(&lang) {
                languages_set.push(lang);
            }
            results.push(result);
        }

        let avg_complexity = if !results.is_empty() {
            sum_complexity / results.len() as f64
        } else {
            0.0
        };

        BatchAnalysisResult {
            total_files: results.len(),
            total_functions,
            total_classes,
            avg_complexity,
            languages: languages_set,
            files: results,
        }
    }
}

// ── Internal helpers ─────────────────────────────────────────────

/// Returns `true` if the upstream `aiyouvector-codebase` can parse
/// the given extension. Used to short-circuit when a file has no
/// grammar (e.g. `.txt`, `.lock`) and we should return an empty
/// result without writing a temp file.
fn has_grammar_for(ext: &str) -> bool {
    language_for_extension(ext).is_some()
}

fn extract_via_treesitter(
    path: &str,
    source: &str,
    complexity_fn: &dyn Fn(&str, &str) -> f64,
) -> (Vec<FunctionDecl>, Vec<ClassDecl>, Vec<ImportDecl>, f64) {
    // Pick the extension from the path (last "." segment, lowercased).
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();

    if !has_grammar_for(&ext) {
        return (Vec::new(), Vec::new(), Vec::new(), 0.0);
    }

    // Write source to a temp file with the right extension so the
    // upstream `parse_file` can pick the correct grammar.
    let tmp = match write_tempfile(source, &ext) {
        Ok(t) => t,
        Err(_) => return (Vec::new(), Vec::new(), Vec::new(), 0.0),
    };

    let parsed = match parse_file(tmp.path(), Path::new(path)) {
        Ok(p) => p,
        Err(_) => return (Vec::new(), Vec::new(), Vec::new(), 0.0),
    };

    let symbols = extract_symbols(&parsed);

    let mut functions: Vec<FunctionDecl> = Vec::new();
    let mut classes: Vec<ClassDecl> = Vec::new();
    let mut imports: Vec<ImportDecl> = derive_imports(&parsed.source, &symbols);

    for sym in &symbols {
        match sym.kind {
            NodeKind::Function | NodeKind::Method => {
                functions.push(symbol_to_function(sym, source, complexity_fn));
            }
            NodeKind::Class | NodeKind::Interface | NodeKind::Enum => {
                // Methods are children in the symbol stream (qualified
                // name has the class as parent). Collect them here.
                let methods: Vec<FunctionDecl> = symbols
                    .iter()
                    .filter(|s| {
                        matches!(s.kind, NodeKind::Method)
                            && s.qualified_name.starts_with(&sym.qualified_name)
                            && s.qualified_name != sym.qualified_name
                    })
                    .map(|s| symbol_to_function(s, source, complexity_fn))
                    .collect();
                classes.push(ClassDecl {
                    name: sym.name.clone(),
                    start_line: sym.start_line as usize,
                    end_line: sym.end_line as usize,
                    methods,
                    parent_class: None, // upstream does not surface this
                    interfaces: Vec::new(),
                });
            }
            _ => {}
        }
    }

    let overall_complexity = if functions.is_empty() {
        0.0
    } else {
        functions.iter().map(|f| f.complexity).sum::<f64>() / functions.len() as f64
    };

    // Dedup imports by source.
    let mut seen: HashSet<String> = HashSet::new();
    imports.retain(|i| seen.insert(i.source.clone()));

    (functions, classes, imports, overall_complexity)
}

fn write_tempfile(source: &str, ext: &str) -> std::io::Result<NamedTempFile> {
    let suffix = if ext.is_empty() {
        None
    } else {
        Some(format!(".{ext}"))
    };
    let tmp = match suffix {
        Some(s) => tempfile::Builder::new().suffix(&s).tempfile()?,
        None => tempfile::Builder::new().tempfile()?,
    };
    std::fs::write(tmp.path(), source)?;
    Ok(tmp)
}

fn symbol_to_function(
    sym: &Symbol,
    source: &str,
    complexity_fn: &dyn Fn(&str, &str) -> f64,
) -> FunctionDecl {
    let body = extract_body(source, sym.start_line as usize, sym.end_line as usize);
    let complexity = complexity_fn(&sym.name, &body);
    // The upstream `extract_properties` does not surface a doc-comment
    // flag, so we detect it manually by inspecting the line immediately
    // before the function for the conventional doc-comment markers.
    let has_doc_comment = has_doc_comment_above(source, sym.start_line as usize);

    FunctionDecl {
        name: sym.name.clone(),
        start_line: sym.start_line as usize,
        end_line: sym.end_line as usize,
        params: extract_params(sym),
        complexity,
        has_doc_comment,
    }
}

/// Returns `true` if the line immediately above `start_line` looks
/// like a doc comment for the given language family. Detects:
///   - `///` and `//!` (Rust)
///   - `/** ... */` and `//` (JS/TS/Java/Go)
///   - `# ...` and `""" ... """` (Python)
fn has_doc_comment_above(source: &str, start_line: usize) -> bool {
    if start_line < 2 {
        return false;
    }
    let lines: Vec<&str> = source.lines().collect();
    let prev = lines.get(start_line - 2).map(|s| s.trim()).unwrap_or("");
    if prev.is_empty() {
        return false;
    }
    prev.starts_with("///")
        || prev.starts_with("//!")
        || prev.starts_with("/**")
        || prev.starts_with("/*!")
        || prev.starts_with("#")
        || prev.starts_with("\"\"\"")
        || prev.starts_with("'''")
        || prev.starts_with("##")
        || prev.starts_with(";;")
}

fn extract_body(source: &str, start_line: usize, end_line: usize) -> String {
    source
        .lines()
        .skip(start_line.saturating_sub(1))
        .take(end_line.saturating_sub(start_line).max(1))
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_params(sym: &Symbol) -> Vec<String> {
    sym.properties
        .iter()
        .find(|(k, _)| k == "params")
        .map(|(_, v)| {
            v.split(',')
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Derive a flat list of `ImportDecl` entries from the file's source
/// using simple text patterns. The upstream `extract_symbols` does
/// not surface import statements (it focuses on type/function
/// declarations), so we run a lightweight scan as a fallback. The
/// patterns cover the 6 languages that the previous implementation
/// supported; unsupported languages return an empty list.
fn derive_imports(source: &str, symbols: &[Symbol]) -> Vec<ImportDecl> {
    use_imports_from_symbols(symbols)
        .into_iter()
        .chain(text_based_imports(source))
        .collect()
}

fn use_imports_from_symbols(symbols: &[Symbol]) -> Vec<ImportDecl> {
    symbols
        .iter()
        .filter(|s| s.kind == NodeKind::Module || s.kind == NodeKind::Package)
        .map(|s| ImportDecl {
            source: s.name.clone(),
            names: Vec::new(),
            kind: "module".to_string(),
        })
        .collect()
}

fn text_based_imports(source: &str) -> Vec<ImportDecl> {
    let mut out: Vec<ImportDecl> = Vec::new();
    for line in source.lines() {
        let trimmed = line.trim();
        // JS/TS: import x from 'y'  /  import { a, b } from 'y'
        // Must be checked BEFORE the generic Python `import x` so the
        // `from '...'` clause is consumed by the JS handler and the
        // Python fallback doesn't pick up the whole rest as the source.
        if let Some(rest) = trimmed.strip_prefix("import ") {
            if let Some(source) = extract_quoted_after(rest, "from") {
                let (names, kind) = parse_js_import_body(rest);
                out.push(ImportDecl {
                    source,
                    names,
                    kind,
                });
                continue;
            }
            // `import 'side-effect-only';` — no `from` clause.
            if let Some(source) = extract_quoted(rest) {
                out.push(ImportDecl {
                    source,
                    names: Vec::new(),
                    kind: "side_effect".to_string(),
                });
                continue;
            }
        }
        // Python: from x import y, z  /  import x
        if let Some(rest) = trimmed.strip_prefix("from ") {
            if let Some((module, names)) = rest.split_once(" import ") {
                let names: Vec<String> = names
                    .split(',')
                    .map(|n| n.trim().split(" as ").next().unwrap_or("").to_string())
                    .filter(|n| !n.is_empty())
                    .collect();
                out.push(ImportDecl {
                    source: module.trim().to_string(),
                    names,
                    kind: "named".to_string(),
                });
                continue;
            }
        }
        if let Some(rest) = trimmed.strip_prefix("import ") {
            if !rest.contains('=') {
                out.push(ImportDecl {
                    source: rest.trim().to_string(),
                    names: Vec::new(),
                    kind: "side_effect".to_string(),
                });
                continue;
            }
        }
        // CommonJS: const x = require('y')
        if let Some(idx) = trimmed.find("require(") {
            if let Some(source) = extract_quoted_after(&trimmed[idx..], "") {
                out.push(ImportDecl {
                    source,
                    names: Vec::new(),
                    kind: "require".to_string(),
                });
                continue;
            }
        }
        // Rust: use x::y;
        if let Some(rest) = trimmed.strip_prefix("use ") {
            let path = rest.trim_end_matches(';').trim();
            let (module, last) = match path.rsplit_once("::") {
                Some(pair) => pair,
                None => (path, ""),
            };
            let names = if last.is_empty() {
                Vec::new()
            } else {
                vec![last.to_string()]
            };
            out.push(ImportDecl {
                source: module.to_string(),
                names,
                kind: "named".to_string(),
            });
            continue;
        }
        // Go: import "x"  or  import ( "x"; "y" )
        if let Some(rest) = trimmed.strip_prefix("import ") {
            if let Some(source) = extract_quoted(rest) {
                out.push(ImportDecl {
                    source,
                    names: Vec::new(),
                    kind: "side_effect".to_string(),
                });
            }
        }
        // Java: import x.y.Z;
        if let Some(rest) = trimmed.strip_prefix("import ") {
            let path = rest.trim_end_matches(';').trim();
            let name = path.rsplit('.').next().unwrap_or("").to_string();
            let names = if name.is_empty() || path == name {
                Vec::new()
            } else {
                vec![name]
            };
            out.push(ImportDecl {
                source: path.to_string(),
                names,
                kind: "named".to_string(),
            });
        }
    }
    out
}

fn extract_quoted(s: &str) -> Option<String> {
    let s = s.trim();
    let bytes = s.as_bytes();
    for (i, c) in bytes.iter().enumerate() {
        if *c == b'"' || *c == b'\'' {
            for j in (i + 1)..bytes.len() {
                if bytes[j] == *c {
                    return Some(s[i + 1..j].to_string());
                }
            }
        }
    }
    None
}

fn extract_quoted_after(s: &str, marker: &str) -> Option<String> {
    let after = if marker.is_empty() {
        s
    } else {
        s.split(marker).nth(1)?
    };
    extract_quoted(after)
}

fn parse_js_import_body(rest: &str) -> (Vec<String>, String) {
    // Returns (names, kind) where kind is "default", "named", or "side_effect".
    if let Some(brace_start) = rest.find('{') {
        if let Some(brace_end) = rest.find('}') {
            let inside = &rest[brace_start + 1..brace_end];
            let names: Vec<String> = inside
                .split(',')
                .map(|n| n.trim().split(" as ").next().unwrap_or("").to_string())
                .filter(|n| !n.is_empty())
                .collect();
            return (names, "named".to_string());
        }
    }
    if let Some(name) = rest.split_whitespace().next() {
        if name == "import" {
            return (Vec::new(), "side_effect".to_string());
        }
        return (vec![name.to_string()], "default".to_string());
    }
    (Vec::new(), "side_effect".to_string())
}

// ── Line counting, complexity, and nesting (kept local) ──────────

/// Per-language `(* // etc) comment markers used for line counting.
/// Kept local — too small to delegate and the heuristics depend on
/// subtle multi-character sequences (Python triple-quotes, Rust
/// block comments, etc.) that the upstream crate does not surface.
fn count_lines(lines: &[&str], language: Language) -> (usize, usize) {
    let mut blank = 0;
    let mut comments = 0;
    let mut in_block_comment = false;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            blank += 1;
            continue;
        }

        if in_block_comment {
            comments += 1;
            if trimmed.contains("*/") || trimmed.contains("'''") || trimmed.contains("\"\"\"") {
                in_block_comment = false;
            }
            continue;
        }

        let is_comment = match language {
            Language::Python => {
                trimmed.starts_with('#')
                    || trimmed.starts_with("\"\"\"")
                    || trimmed.starts_with("'''")
            }
            Language::Rust
            | Language::Go
            | Language::Java
            | Language::JavaScript
            | Language::TypeScript
            | Language::C
            | Language::Cpp
            | Language::CSharp
            | Language::Ruby
            | Language::Php
            | Language::Scala
            | Language::Bash => {
                trimmed.starts_with("//")
                    || trimmed.starts_with("/*")
                    || trimmed.starts_with("*")
                    || trimmed.starts_with("/**")
            }
            _ => false,
        };

        if is_comment {
            comments += 1;
            if (trimmed.starts_with("/*") || trimmed.starts_with("/**")) && !trimmed.contains("*/")
            {
                in_block_comment = true;
            }
            if language == Language::Python
                && (trimmed.starts_with("\"\"\"") || trimmed.starts_with("'''"))
                && (trimmed.matches("\"\"\"").count() < 2 && trimmed.matches("'''").count() < 2)
            {
                in_block_comment = true;
            }
        }
    }

    (blank, comments)
}

fn max_nesting_depth(lines: &[&str]) -> usize {
    let mut max = 0;
    let mut current = 0;
    for line in lines {
        for c in line.chars() {
            match c {
                '{' | '(' | '[' => {
                    current += 1;
                    if current > max {
                        max = current;
                    }
                }
                '}' | ')' | ']' => {
                    if current > 0 {
                        current -= 1;
                    }
                }
                _ => {}
            }
        }
    }
    max
}

/// Approximate cyclomatic complexity by counting control-flow
/// keywords in the function body. Cheap, language-agnostic, and
/// consistent with what the previous implementation produced.
fn functions_complexity_for_language(_language: Language) -> impl Fn(&str, &str) -> f64 {
    |_name, body| {
        let mut count = 1.0;
        for keyword in [
            "if ", "else if ", "else", "for ", "while ", "switch ", "case ", "&&", "||", "?",
        ] {
            count += body.matches(keyword).count() as f64 * 0.5;
        }
        // Catch (with try in some languages)
        count += body.matches("catch ").count() as f64;
        count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_from_filename_covers_19_languages() {
        assert_eq!(Language::from_filename("foo.rs"), Language::Rust);
        assert_eq!(Language::from_filename("foo.ts"), Language::TypeScript);
        assert_eq!(Language::from_filename("foo.py"), Language::Python);
        assert_eq!(Language::from_filename("foo.go"), Language::Go);
        assert_eq!(Language::from_filename("foo.java"), Language::Java);
        assert_eq!(Language::from_filename("foo.cpp"), Language::Cpp);
        assert_eq!(Language::from_filename("foo.cs"), Language::CSharp);
        assert_eq!(Language::from_filename("foo.rb"), Language::Ruby);
        assert_eq!(Language::from_filename("foo.php"), Language::Php);
        assert_eq!(Language::from_filename("foo.scala"), Language::Scala);
        assert_eq!(Language::from_filename("foo.yaml"), Language::Yaml);
        assert_eq!(Language::from_filename("foo.json"), Language::Json);
        assert_eq!(Language::from_filename("foo.md"), Language::Markdown);
        assert_eq!(Language::from_filename("foo.html"), Language::Html);
        assert_eq!(Language::from_filename("foo.css"), Language::Css);
        assert_eq!(Language::from_filename("foo.sh"), Language::Bash);
        assert_eq!(Language::from_filename("foo.unknown"), Language::Unknown);
    }

    #[test]
    fn analyze_rust_extracts_function() {
        let src = r#"
/// Doc comment
fn greet(name: &str) -> String {
    format!("Hello, {name}")
}

fn main() {
    println!("{}", greet("world"));
}
"#;
        let r = Analyzer::analyze("test.rs", src);
        assert_eq!(r.language, "rust");
        assert!(r.functions.iter().any(|f| f.name == "greet"));
        assert!(r.functions.iter().any(|f| f.name == "main"));
        assert!(r
            .functions
            .iter()
            .any(|f| f.name == "greet" && f.has_doc_comment));
    }

    #[test]
    fn analyze_python_extracts_imports() {
        let src = "from os import path\nimport sys\n";
        let r = Analyzer::analyze("test.py", src);
        assert!(r.imports.iter().any(|i| i.source == "os"));
        assert!(r.imports.iter().any(|i| i.source == "sys"));
    }

    #[test]
    fn analyze_javascript_extracts_imports() {
        let src = "import { readFile } from 'fs';\nconst x = require('path');\n";
        let r = Analyzer::analyze("test.js", src);
        assert!(r.imports.iter().any(|i| i.source == "fs"));
        assert!(r.imports.iter().any(|i| i.source == "path"));
    }

    #[test]
    fn analyze_unknown_returns_empty_functions() {
        let r = Analyzer::analyze("foo.unknown", "x = 1");
        // No grammar → no functions, but the metadata (line counts)
        // is still computed.
        assert_eq!(r.language, "unknown");
        assert_eq!(r.total_lines, 1);
    }

    #[test]
    fn analyze_batch_aggregates() {
        let files = vec![
            ("a.rs".to_string(), "fn a() {}".to_string()),
            ("b.py".to_string(), "def b():\n    pass".to_string()),
        ];
        let r = Analyzer::analyze_batch(files);
        assert_eq!(r.total_files, 2);
        assert!(r.languages.contains(&"rust".to_string()));
        assert!(r.languages.contains(&"python".to_string()));
    }
}
