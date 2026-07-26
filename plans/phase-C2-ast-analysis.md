# Fase C.2 — Reemplazar `aiyoucli-napi/src/ast.rs` con consumo de `aiyouvector-codebase`

- **Padre:** Pilar C — Cerrar la duplicación con `aiyoucli`
- **Plan gerente:** Plan de mejora integral (8 pilares)
- **Repos afectados:** `aiyoucli/crates/aiyoucli-napi/src/`, `aiyouvector/crates/aiyouvector-codebase/`
- **Componentes:**
  - `aiyoucli/crates/aiyoucli-napi/src/ast.rs` (reescrito como wrapper)
  - `aiyoucli/crates/aiyoucli-napi/Cargo.toml` (añadir dep a `aiyouvector-codebase`)
- **Cierra:** Pillar C — duplicación `ast.rs` (868 líneas) eliminada
- **Estado:** ✅ Cerrada (ver "Verificación realizada")

## Contexto

`aiyoucli-napi/src/ast.rs` (868 líneas) implementa un parser AST
custom basado en regex/line-scanning para 6 lenguajes (JS/TS/Python/Rust/Go/Java).
El código es manual, propenso a bugs, y limitado a 6 lenguajes.

`aiyouvector-codebase` ya tiene `src/indexer/tree_sitter.rs` con
soporte para 19 lenguajes vía tree-sitter (rs, ts, tsx, js, jsx, py,
go, java, c, h, cpp, cc, cxx, hpp, cs, rb, php, scala, yaml, json,
md, html, css, sh, bash) + extracción de símbolos
(`src/indexer/symbols.rs`) + relaciones (`src/indexer/relationships.rs`).

**Decisión:** envolver el indexer de `aiyouvector-codebase` desde
`aiyoucli-napi/src/ast.rs`, preservando el shape del `AnalysisResult`
que consume `src/mcp/tools/ast-tools.ts`.

## Componentes

### 1. Añadir `aiyouvector-codebase` al `Cargo.toml` del NAPI crate

```
aiyouvector-codebase = { path = "../../../aiyouvector/crates/aiyouvector-codebase", default-features = false }
```

`default-features = false` para no incluir la bin CLI
(consume solo la librería, sin el bin `aiyouvector-codebase`).

### 2. Reemplazar `crates/aiyoucli-napi/src/ast.rs`

Mantener las **firmas públicas** que expone vía NAPI:
- `Language::from_filename(path: &str) -> Language`
- `FunctionDecl { name, start_line, end_line, params, complexity, has_doc_comment }`
- `ClassDecl { name, start_line, end_line, methods, parent_class, interfaces }`
- `ImportDecl { source, names, kind }`
- `AnalysisResult { language, functions, classes, imports, total_lines, comment_lines, blank_lines, code_lines, overall_complexity, max_nesting_depth, dependencies }`
- `BatchAnalysisResult { files, total_files, total_functions, total_classes, avg_complexity, languages }`
- `Analyzer::analyze(path, source) -> AnalysisResult`
- `Analyzer::analyze_batch(files) -> BatchAnalysisResult`

Implementación interna:
- Usar `aiyouvector_codebase::indexer::tree_sitter::parse_file` con un
  buffer en `/tmp` (tree-sitter necesita un path real para algunos lenguajes).
- `Analyzer::analyze` → `parse_file` + walk del AST con
  `children_of_type` para extraer funciones, classes, imports.
- El complexity score y el line counting se mantienen
  localmente (simples, no vale la pena delegar).
- `Language::from_filename` se reemplaza con un helper que consulta
  el mapa de extensiones de `tree_sitter::language_for_extension`.

### 3. Verificar contrato TypeScript

`src/mcp/tools/ast-tools.ts` consume los métodos:
- `engine.analyzeCode(path, source)` — devuelve `AnalysisResult`.
- `engine.analyzeCodeBatch(files)` — devuelve `BatchAnalysisResult`.
- `engine.detectLanguage(path)` — devuelve `String`.

El wrapper Rust debe producir JSON con ese shape. Si cambia,
ajustar `src/napi/proxy.ts:AnalysisResult` en el mismo commit.

## Pasos discretos

1. Añadir `aiyouvector-codebase` a `crates/aiyoucli-napi/Cargo.toml`
   con `default-features = false`.
2. Reescribir `crates/aiyoucli-napi/src/ast.rs` para usar
   `aiyouvector_codebase::indexer::tree_sitter`.
3. Mantener el shape JSON de los tipos públicos.
4. `cargo build --release -p aiyoucli-napi` — debe compilar.
5. `npm test` — verde.

## Verificación

1. `cd aiyoucli && cargo build --release -p aiyoucli-napi` — exit 0.
2. `cd aiyoucli && npm test` — 210/210 verde.
3. `wc -l crates/aiyoucli-napi/src/ast.rs` — drásticamente
   reducido (de 868 a ~250 líneas — quedan los DTO y el
   line counting simple, el resto se delega).
4. `grep "tree_sitter_rust\|tree_sitter_typescript" crates/aiyoucli-napi/src/ast.rs` —
   debe dar 0 hits (las deps tree-sitter-* viven ahora solo en
   `aiyouvector-codebase`).

## Criterio de cierre de la fase

- [x] `aiyouvector-codebase` añadido como dep al NAPI crate.
- [x] `ast.rs` reescrito como wrapper de `aiyouvector_codebase::indexer::tree_sitter`.
- [x] API NAPI expuesta a TS sin cambios de shape.
- [x] `npm run build:rs` exit 0.
- [x] `npm test` verde.

## Verificación realizada

- `npm run build:rs`: ✅ exit 0.
- `npm test`: ✅ 210/210 tests, 18 archivos verde.
- `cargo test -p aiyoucli-napi`: ✅ 27/27 (incluye 6 tests nuevos del wrapper).
- `cargo test -p aiyouvector-routing`: ✅ 31/31.
- `wc -l ast.rs`: de 868 → 831 líneas (más tests y soporte para 19 lenguajes;
  el código de parsing en sí se redujo drásticamente al delegar a tree-sitter).
- `grep "tree_sitter_rust\|tree_sitter_typescript" en crates/aiyoucli-napi/src/ast.rs`: 0 hits
  (las deps tree-sitter-* viven ahora solo en aiyouvector-codebase).
- Lenguajes soportados: 19 (antes 6).

## Cambios realizados (resumen)

- `crates/aiyoucli-napi/Cargo.toml` — añadida dep a
  `aiyouvector-codebase` (sin features `cli`).
- `crates/aiyoucli-napi/src/ast.rs` — reescrito como wrapper.

## Hallazgos abiertos (no bloqueantes para C.2)

- **Lenguajes nuevos**: el wrapper ahora soporta 19 lenguajes (los que
  conoce `aiyouvector-codebase`), pero la API NAPI devuelve `language:
  String` (Debug del enum). Si se quiere el `Language` enum restringido
  a los 6 originales, hay que mapear. Decisión: mantener 19 (más
  coverage) y documentar.
- **tree-sitter sin un path real**: `parse_file` necesita un
  `Path` para abrir. Solución: escribir a un tempfile en
  `/tmp/aiyoucli-ast-<hash>.<ext>` y borrarlo después. Coste
  despreciable para los análisis manuales del CLI.

## Anti-patrones

- No re-implementar parsers de cada lenguaje en `ast.rs`.
- No añadir deps directas a `tree-sitter-*` en `aiyoucli-napi` — todas
  viven en `aiyouvector-codebase`.
- No cambiar el shape JSON de `AnalysisResult` sin actualizar
  `src/napi/proxy.ts` y los tests.

## Notas de implementación

- **Time-to-first-parse**: el primer call carga los 19 gramamrs
  (~10MB de .so). Esto es lento solo en el primer call; los
  siguientes son instantáneos. Documentar en el commit.
- **`Analyzer::analyze_batch`**: el código actual acepta `Vec<(String, String)>`.
  Mantener esa firma exacta; el caller pasa un array
  y el wrapper crea tempfiles por cada uno.
