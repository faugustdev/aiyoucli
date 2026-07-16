//! Multi-language code analyzer — extracts AST-like structure from source code.
//!
//! Language detection, function/method/class extraction, per-function
//! complexity scoring, and dependency graph building.
//!
//! Supports: JavaScript, TypeScript, Python, Rust, Go, Java

use serde::Serialize;

// ── Language detection ───────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Language {
    JavaScript,
    TypeScript,
    Python,
    Rust,
    Go,
    Java,
    Unknown,
}

impl Language {
    pub fn from_filename(path: &str) -> Self {
        let lower = path.to_lowercase();
        if lower.ends_with(".js") || lower.ends_with(".jsx") || lower.ends_with(".mjs") || lower.ends_with(".cjs") {
            Language::JavaScript
        } else if lower.ends_with(".ts") || lower.ends_with(".tsx") || lower.ends_with(".mts") {
            Language::TypeScript
        } else if lower.ends_with(".py") {
            Language::Python
        } else if lower.ends_with(".rs") {
            Language::Rust
        } else if lower.ends_with(".go") {
            Language::Go
        } else if lower.ends_with(".java") || lower.ends_with(".kt") {
            Language::Java
        } else {
            Language::Unknown
        }
    }

    pub fn extensions(&self) -> &[&str] {
        match self {
            Language::JavaScript => &["js", "jsx", "mjs", "cjs"],
            Language::TypeScript => &["ts", "tsx", "mts"],
            Language::Python => &["py"],
            Language::Rust => &["rs"],
            Language::Go => &["go"],
            Language::Java => &["java", "kt"],
            Language::Unknown => &[],
        }
    }
}

// ── AST Node types ───────────────────────────────────────────────

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
    pub fn analyze(path: &str, source: &str) -> AnalysisResult {
        let language = Language::from_filename(path);
        let lines: Vec<&str> = source.lines().collect();
        let total_lines = lines.len();

        let (blank_lines, comment_lines, code_lines) = Self::count_lines(&lines, language);
        let functions = Self::extract_functions(&lines, language);
        let classes = Self::extract_classes(&lines, language, &functions);
        let imports = Self::extract_imports(&lines, language);
        let max_nesting = Self::max_nesting_depth(&lines);
        let overall_complexity = Self::calculate_overall_complexity(&functions);

        let mut dependencies: Vec<String> = Vec::new();
        for imp in &imports {
            if !dependencies.contains(&imp.source) {
                dependencies.push(imp.source.clone());
            }
        }

        AnalysisResult {
            language: format!("{:?}", language),
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

        let avg_complexity = if total_functions > 0 {
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

    // ── Line counting ───────────────────────────────────────────

    fn count_lines(lines: &[&str], language: Language) -> (usize, usize, usize) {
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
                Language::Rust | Language::Go | Language::Java | Language::JavaScript | Language::TypeScript => {
                    trimmed.starts_with("//")
                        || trimmed.starts_with("/*")
                        || trimmed.starts_with("*")
                        || trimmed.starts_with("/**")
                }
                _ => false,
            };

            if is_comment {
                comments += 1;
                if (trimmed.starts_with("/*") || trimmed.starts_with("/**"))
                    && !trimmed.contains("*/")
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

        let code = lines.len() - blank - comments;
        (blank, comments, code)
    }

    // ── Function extraction ─────────────────────────────────────

    fn extract_functions(lines: &[&str], language: Language) -> Vec<FunctionDecl> {
        let mut functions = Vec::new();
        let mut i = 0;

        while i < lines.len() {
            let trimmed = lines[i].trim();

            if let Some(name) = Self::match_function_declaration(trimmed, language) {
                let params = Self::extract_params(trimmed, language);
                let start_line = i + 1; // 1-indexed
                let has_doc = i > 0 && Self::is_doc_comment(lines[i - 1].trim(), language);

                // Find end of function by tracking brace/paren depth
                let end_line = Self::find_function_end(lines, i, language);

                // Extract function body for complexity analysis
                let body: Vec<&str> = if end_line > i {
                    lines[i..=end_line.min(lines.len() - 1)].to_vec()
                } else {
                    vec![]
                };

                let complexity = Self::calculate_function_complexity(&body, language);

                functions.push(FunctionDecl {
                    name,
                    start_line,
                    end_line: end_line.saturating_add(1),
                    params,
                    complexity,
                    has_doc_comment: has_doc,
                });

                i = end_line.max(i + 1);
            } else {
                i += 1;
            }
        }

        functions
    }

    fn match_function_declaration(line: &str, lang: Language) -> Option<String> {
        match lang {
            Language::JavaScript | Language::TypeScript => {
                // function name(...)
                if let Some(cap) = line.find(|c: char| c == '(' || c == '=') {
                    let before = &line[..cap].trim();
                    for prefix in &["function ", "async function ", "export function ", "export default function"] {
                        if let Some(name) = before.strip_prefix(prefix) {
                            let name = name.trim();
                            if !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$') {
                                return Some(name.to_string());
                            }
                        }
                    }
                }
                // Arrow function: const name = (...) => ...
                if line.contains("=>") && line.contains("const ") {
                    if let Some(name) = line
                        .strip_prefix("const ")
                        .and_then(|s| s.split('=').next())
                        .map(|s| s.trim().to_string())
                    {
                        if !name.is_empty() {
                            return Some(name);
                        }
                    }
                }
                // Method shorthand: [modifiers] name(...) { ... }
                if line.contains('(') && line.contains(')') && line.contains('{') && !line.contains("function") {
                    let before_paren = line.split('(').next().unwrap_or("").trim();
                    if before_paren.contains('=') { return None; }
                    // Handle inline class: "class X { name(...)" → extract part after last '{'
                    let after_brace = before_paren.rsplit('{').next().unwrap_or(before_paren).trim();
                    // Strip method modifiers (async, static, get, set)
                    let after_mods = after_brace
                        .strip_prefix("async ")
                        .or_else(|| after_brace.strip_prefix("static "))
                        .or_else(|| after_brace.strip_prefix("get "))
                        .or_else(|| after_brace.strip_prefix("set "))
                        .unwrap_or(after_brace);
                    let name = after_mods.split_whitespace().next().unwrap_or(after_mods).trim();
                    if !name.is_empty()
                        && !matches!(name, "if" | "for" | "while" | "switch" | "catch" | "do" | "with" | "case")
                        && name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$' || c == '#')
                    {
                        return Some(name.to_string());
                    }
                }
                None
            }
            Language::Python => {
                if let Some(rest) = line.strip_prefix("def ") {
                    let name = rest.split('(').next()?.trim();
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
                if let Some(rest) = line.strip_prefix("async def ") {
                    let name = rest.split('(').next()?.trim();
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
                None
            }
            Language::Rust => {
                if let Some(rest) = line.strip_prefix("fn ") {
                    let name = rest.split('(').next()?.trim();
                    if !name.is_empty() && name != "main" || line.contains("fn main") {
                        return Some(name.to_string());
                    }
                }
                // Handle `pub fn`, `pub(crate) fn`, `unsafe fn`
                if line.contains(" fn ") {
                    let parts: Vec<&str> = line.split(" fn ").collect();
                    if parts.len() >= 2 {
                        let name = parts[1].split('(').next()?.trim();
                        if !name.is_empty() {
                            return Some(name.to_string());
                        }
                    }
                }
                None
            }
            Language::Go => {
                if let Some(rest) = line.strip_prefix("func ") {
                    let name = rest.split('(').next()?.trim();
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
                None
            }
            Language::Java => {
                // public/private/protected Type name(...) { ... }
                let keywords = ["public ", "private ", "protected ", "static ", "final ", "abstract ", "synchronized "];
                let mut stripped = line;
                for kw in &keywords {
                    if let Some(s) = stripped.strip_prefix(kw) {
                        stripped = s;
                    }
                }
                if let Some(rest) = stripped.strip_prefix("void ").or_else(|| {
                    // Match return type before function name
                    let parts: Vec<&str> = stripped.splitn(2, |c: char| c.is_whitespace()).collect();
                    if parts.len() >= 2 {
                        let after_type = parts[1];
                        if after_type.contains('(') {
                            Some(after_type)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                }) {
                    let name = rest.split('(').next()?.trim();
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
                None
            }
            Language::Unknown => None,
        }
    }

    fn extract_params(line: &str, lang: Language) -> Vec<String> {
        let paren_start = match line.find('(') {
            Some(pos) => pos,
            None => return vec![],
        };

        if lang == Language::Python {
            if let Some(paren_end) = line[paren_start..].find(')') {
                return line[paren_start + 1..paren_start + paren_end]
                    .split(',')
                    .map(|p| {
                        let p = p.trim();
                        let p = p.split(':').next().unwrap_or(p);
                        let p = p.split('=').next().unwrap_or(p);
                        p.trim().to_string()
                    })
                    .filter(|p| !p.is_empty())
                    .collect();
            }
            return vec![];
        }

        // Braced languages: find matching closing paren
        let mut depth = 0i32;
        let remaining = &line[paren_start..];
        for (i, c) in remaining.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        return line[paren_start + 1..paren_start + i]
                            .split(',')
                            .map(|p| {
                                let p = p.trim();
                                let p = p.split(':').next().unwrap_or(p);
                                let p = p.split('=').next().unwrap_or(p);
                                p.trim().to_string()
                            })
                            .filter(|p| !p.is_empty())
                            .collect();
                    }
                }
                _ => {}
            }
        }
        vec![]
    }

    fn find_function_end(lines: &[&str], start: usize, lang: Language) -> usize {
        if lang == Language::Python {
            // Python: function ends at dedent (next line with same or less indent)
            let base_indent = lines[start].len() - lines[start].trim_start().len();
            let mut i = start + 1;
            while i < lines.len() {
                let trimmed = lines[i].trim();
                if trimmed.is_empty() || Self::is_comment_line(trimmed, lang) {
                    i += 1;
                    continue;
                }
                let indent = lines[i].len() - trimmed.len();
                if indent <= base_indent && !trimmed.is_empty() {
                    break;
                }
                i += 1;
            }
            return i.saturating_sub(1);
        }

        // Braced languages: track { } depth
        let mut depth: i32 = 0;
        // Find first brace to start counting
        for i in start..lines.len() {
            for c in lines[i].chars() {
                match c {
                    '{' => depth += 1,
                    '}' => depth -= 1,
                    _ => {}
                }
            }
            if depth == 0 && i >= start {
                return i;
            }
        }
        lines.len().saturating_sub(1)
    }

    // ── Class extraction ────────────────────────────────────────

    fn extract_classes(lines: &[&str], lang: Language, functions: &[FunctionDecl]) -> Vec<ClassDecl> {
        let mut classes = Vec::new();
        let mut i = 0;

        while i < lines.len() {
            let trimmed = lines[i].trim();

            let class_name: Option<String> = match lang {
                Language::JavaScript | Language::TypeScript => {
                    if let Some(rest) = trimmed.strip_prefix("class ")
                        .or_else(|| trimmed.strip_prefix("export class "))
                        .or_else(|| trimmed.strip_prefix("export default class "))
                    {
                        rest.split('{').next()
                            .and_then(|s| s.split_whitespace().next())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                }
                Language::Python => {
                    if let Some(rest) = trimmed.strip_prefix("class ") {
                        rest.split('(').next()
                            .and_then(|s| s.split(':').next())
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                    } else {
                        None
                    }
                }
                Language::Rust => {
                    if trimmed.starts_with("struct ") || trimmed.starts_with("impl ") {
                        trimmed.split_whitespace().nth(1).map(|s| s.to_string())
                    } else {
                        None
                    }
                }
                Language::Go => {
                    if let Some(rest) = trimmed.strip_prefix("type ") {
                        if rest.contains("struct") {
                            rest.split_whitespace().next().map(|s| s.to_string())
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                }
                Language::Java => {
                    if let Some(rest) = trimmed.strip_prefix("class ")
                        .or_else(|| trimmed.strip_prefix("public class "))
                        .or_else(|| trimmed.strip_prefix("abstract class "))
                        .or_else(|| trimmed.strip_prefix("final class "))
                    {
                        rest.split_whitespace().next().or_else(|| rest.split('{').next())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                }
                _ => None,
            };

            if let Some(name) = class_name {
                // Extract inheritance
                let parent = match lang {
                    Language::JavaScript | Language::TypeScript => {
                        if trimmed.contains("extends ") {
                            trimmed.split("extends ").nth(1)
                                .and_then(|s| s.split_whitespace().next())
                                .map(|s| s.to_string())
                        } else { None }
                    }
                    Language::Python => {
                        if let Some(parens) = trimmed.split('(').nth(1) {
                            parens.split(')').next()
                                .map(|s| s.trim().to_string())
                        } else { None }
                    }
                    Language::Java => {
                        if trimmed.contains("extends ") {
                            trimmed.split("extends ").nth(1)
                                .and_then(|s| s.split_whitespace().next())
                                .map(|s| s.to_string())
                        } else { None }
                    }
                    _ => None,
                };

                // Find class methods (functions within class body range)
                let class_end = Self::find_function_end(lines, i, Language::JavaScript);
                let class_methods: Vec<FunctionDecl> = functions
                    .iter()
                    .filter(|f| f.start_line > i + 1 && f.end_line <= class_end + 1)
                    .cloned()
                    .collect();

                // Extract interfaces
                let interfaces: Vec<String> = if trimmed.contains("implements ") {
                    trimmed.split("implements ").nth(1)
                        .map(|s| s.split('{').next().unwrap_or(s))
                        .map(|s| s.split(',').map(|x| x.trim().to_string()).collect())
                        .unwrap_or_default()
                } else {
                    vec![]
                };

                classes.push(ClassDecl {
                    name,
                    start_line: i + 1,
                    end_line: class_end + 1,
                    methods: class_methods,
                    parent_class: parent,
                    interfaces,
                });

                i = class_end.max(i + 1);
            } else {
                i += 1;
            }
        }

        classes
    }

    // ── Import extraction ───────────────────────────────────────

    fn extract_imports(lines: &[&str], lang: Language) -> Vec<ImportDecl> {
        let mut imports = Vec::new();

        for line in lines {
            let trimmed = line.trim();
            match lang {
                Language::JavaScript | Language::TypeScript => {
                    // import { ... } from "..."
                    if trimmed.starts_with("import ") && trimmed.contains("from ") {
                        let source = trimmed.split("from ").nth(1)
                            .and_then(|s| {
                                let s = s.trim();
                                Some(s.trim_matches(|c: char| c == '"' || c == '\'' || c == ';').to_string())
                            })
                            .unwrap_or_default();
                        let names: Vec<String> = if let Some(braces) = trimmed.split('{').nth(1) {
                            braces.split('}').next()
                                .map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
                                .unwrap_or_default()
                        } else {
                            vec![]
                        };
                        imports.push(ImportDecl {
                            source,
                            names,
                            kind: "named".to_string(),
                        });
                    }
                    // import name from "..."
                    if trimmed.starts_with("import ") && !trimmed.contains('{') && trimmed.contains("from ") {
                        let name = trimmed.strip_prefix("import ")
                            .and_then(|s| s.split("from ").next())
                            .map(|s| s.trim().to_string())
                            .unwrap_or_default();
                        let source = trimmed.split("from ").nth(1)
                            .and_then(|s| Some(s.trim().trim_matches(|c: char| c == '"' || c == '\'' || c == ';').to_string()))
                            .unwrap_or_default();
                        imports.push(ImportDecl {
                            source,
                            names: if name.is_empty() { vec![] } else { vec![name] },
                            kind: "default".to_string(),
                        });
                    }
                    // require(...)
                    if trimmed.contains("require(") {
                        let source = trimmed.split("require(").nth(1)
                            .and_then(|s| s.split(')').next())
                            .map(|s| s.trim().trim_matches(|c: char| c == '"' || c == '\'').to_string())
                            .unwrap_or_default();
                        imports.push(ImportDecl {
                            source,
                            names: vec![],
                            kind: "require".to_string(),
                        });
                    }
                }
                Language::Python => {
                    // import x
                    if let Some(rest) = trimmed.strip_prefix("import ") {
                        let names: Vec<String> = rest.split(',').map(|s| s.trim().split(' ').next().unwrap_or(s.trim()).to_string()).collect();
                        for name in names {
                            imports.push(ImportDecl {
                                source: name.clone(),
                                names: vec![],
                                kind: "named".to_string(),
                            });
                        }
                    }
                    // from x import y [, z]
                    if let Some(rest) = trimmed.strip_prefix("from ") {
                        let parts: Vec<&str> = rest.splitn(2, " import ").collect();
                        if parts.len() == 2 {
                            let source = parts[0].trim().to_string();
                            let names: Vec<String> = parts[1].split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
                            imports.push(ImportDecl {
                                source,
                                names,
                                kind: "named".to_string(),
                            });
                        }
                    }
                }
                Language::Rust => {
                    if let Some(rest) = trimmed.strip_prefix("use ") {
                        let path = rest.trim_end_matches(';');
                        // Check for grouped imports: use foo::{Bar, Baz}
                        if let Some(braces) = path.split("::{").nth(1) {
                            let source = path.split("::").next().unwrap_or("").to_string();
                            let names: Vec<String> = braces.trim_end_matches('}')
                                .split(',')
                                .map(|s| s.trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                            imports.push(ImportDecl {
                                source,
                                names,
                                kind: "named".to_string(),
                            });
                        } else {
                            imports.push(ImportDecl {
                                source: path.to_string(),
                                names: vec![],
                                kind: "named".to_string(),
                            });
                        }
                    }
                }
                Language::Go => {
                    if trimmed.starts_with("import ") {
                        let source = trimmed.trim_start_matches("import ")
                            .trim_matches(|c: char| c == '"' || c == '(' || c == ')' || c == '\n')
                            .to_string();
                        if !source.is_empty() {
                            imports.push(ImportDecl {
                                source,
                                names: vec![],
                                kind: "named".to_string(),
                            });
                        }
                    }
                }
                Language::Java => {
                    if let Some(rest) = trimmed.strip_prefix("import ") {
                        let source = rest.trim_end_matches(';').to_string();
                        imports.push(ImportDecl {
                            source,
                            names: vec![],
                            kind: "named".to_string(),
                        });
                    }
                }
                _ => {}
            }
        }

        imports
    }

    // ── Complexity scoring ──────────────────────────────────────

    fn calculate_function_complexity(lines: &[&str], lang: Language) -> f64 {
        let mut branch_count = 0u32;
        let mut nesting_depth = 0i32;
        let mut max_nesting = 0i32;
        let mut line_count = 0u32;
        let mut string_literals = 0u32;

        for line in lines {
            let trimmed = line.trim();
            if trimmed.is_empty() || Self::is_comment_line(trimmed, lang) {
                continue;
            }
            line_count += 1;

            // Count string literals
            string_literals += trimmed.matches('"').count() as u32 / 2;
            string_literals += trimmed.matches('\'').count() as u32 / 2;

            // Nesting depth
            nesting_depth += trimmed.matches('{').count() as i32;
            nesting_depth -= trimmed.matches('}').count() as i32;
            if lang == Language::Python {
                // Python uses indentation, approximated by whitespace
                let indent = line.len() - trimmed.len();
                let est_depth = indent / 4;
                if est_depth as i32 > max_nesting {
                    max_nesting = est_depth as i32;
                }
            } else {
                if nesting_depth > max_nesting {
                    max_nesting = nesting_depth;
                }
            }

            // Branch detection (language-agnostic)
            let branch_keywords: &[&str] = match lang {
                Language::Python => &["if ", "elif ", "else:", "for ", "while ", "try:", "except:", "with "],
                Language::Rust => &["if ", "else if ", "match ", "for ", "while ", "loop "],
                Language::Go => &["if ", "else if ", "for ", "switch ", "select ", "case "],
                _ => &["if ", "else if", "for ", "while ", "switch ", "case ", "catch", "&&", "||"],
            };
            for kw in branch_keywords {
                if trimmed.starts_with(kw) || trimmed.contains(kw) {
                    branch_count += 1;
                    break;
                }
            }
        }

        // Normalize to 0-1
        let line_score = (line_count as f64 / 100.0).min(1.0);
        let nesting_score = (max_nesting as f64 / 5.0).min(1.0);
        let branch_score = (branch_count as f64 / 20.0).min(1.0);
        let string_score = (string_literals as f64 / 30.0).min(1.0);

        let raw = line_score * 0.3 + nesting_score * 0.3 + branch_score * 0.3 + string_score * 0.1;
        (raw * 100.0).round() / 100.0
    }

    fn calculate_overall_complexity(functions: &[FunctionDecl]) -> f64 {
        if functions.is_empty() {
            return 0.0;
        }
        let sum: f64 = functions.iter().map(|f| f.complexity).sum();
        (sum / functions.len() as f64 * 100.0).round() / 100.0
    }

    fn max_nesting_depth(lines: &[&str]) -> usize {
        let mut depth = 0i32;
        let mut max_depth = 0i32;
        for line in lines {
            depth += line.matches('{').count() as i32;
            depth -= line.matches('}').count() as i32;
            if depth > max_depth {
                max_depth = depth;
            }
        }
        max_depth.max(0) as usize
    }

    // ── Helpers ─────────────────────────────────────────────────

    fn is_comment_line(trimmed: &str, lang: Language) -> bool {
        match lang {
            Language::Python => trimmed.starts_with('#'),
            _ => trimmed.starts_with("//") || trimmed.starts_with("/*") || trimmed.starts_with('*'),
        }
    }

    fn is_doc_comment(trimmed: &str, lang: Language) -> bool {
        match lang {
            Language::Python => trimmed.starts_with("\"\"\"") || trimmed.starts_with("'''") || trimmed.starts_with("#"),
            Language::Rust => trimmed.starts_with("///") || trimmed.starts_with("//!"),
            Language::Go | Language::Java => trimmed.starts_with("// ") || trimmed.starts_with("/*"),
            _ => trimmed.starts_with("/**") || trimmed.starts_with("//"),
        }
    }
}
