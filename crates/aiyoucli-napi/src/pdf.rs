//! PDF → Markdown conversion, backed by `pdfrs` (pure Rust, no Poppler/
//! PDFium/system libs). Native/selectable text only — scanned PDFs with no
//! embedded text layer yield empty or near-empty output; OCR is out of
//! scope here (see project docs).
//!
//! Split-layer pattern, same as `codebase.rs`: reading a PDF is genuinely
//! fallible (missing file, corrupt/encrypted PDF), so the plain layer
//! returns `anyhow::Result<T>` and the `#[napi]` layer converts errors the
//! same way `vector.rs`/`graph.rs`/`codebase.rs` do:
//! `.map_err(|e| Error::new(Status::GenericFailure, ...))`.

use anyhow::{Context, Result as AResult};
use napi::bindgen_prelude::*;

pub fn pdf_to_markdown_impl(path: &str) -> AResult<String> {
    let bytes = std::fs::read(path).with_context(|| format!("read failed: {path}"))?;
    pdfrs::pdf_to_md::pdf_to_markdown_bytes(&bytes)
        .with_context(|| format!("pdf parse failed: {path}"))
}

#[napi]
pub fn pdf_to_markdown(path: String) -> Result<String> {
    pdf_to_markdown_impl(&path).map_err(|e| Error::new(Status::GenericFailure, format!("{e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trips through pdfrs's own Markdown→PDF generator so the test
    /// doesn't depend on an external fixture file.
    #[test]
    fn round_trip_simple_document() {
        let md = "# Hello\n\nA simple paragraph.\n\n## Section\n\n- one\n- two\n- three\n";
        let elements = pdfrs::elements::parse_markdown(md);
        let layout = pdfrs::pdf_generator::PageLayout::portrait();
        let pdf_bytes = pdfrs::pdf_generator::generate_pdf_bytes(&elements, "Helvetica", 12.0, layout)
            .expect("pdfrs should generate a PDF from markdown");
        let out = pdfrs::pdf_to_md::pdf_to_markdown_bytes(&pdf_bytes)
            .expect("pdfrs should parse the PDF it just generated");
        assert!(out.contains("Hello"));
        assert!(out.contains("Section"));
        assert!(out.contains("one"));
    }

    #[test]
    fn missing_file_is_an_error() {
        let err = pdf_to_markdown_impl("/nonexistent/path/does-not-exist.pdf");
        assert!(err.is_err());
    }

    /// Not run by default — regenerates `__tests__/fixtures/sample.pdf`,
    /// consumed by the vitest `pdfToMarkdown` test. Re-run manually
    /// (`cargo test -p aiyoucli-napi -- --ignored regenerate_fixture`) only
    /// if that fixture needs to change.
    #[test]
    #[ignore]
    fn regenerate_fixture() {
        let md = "# Sample PDF\n\nHello from pdfrs.\n\n## Notes\n\n- one\n- two\n";
        let elements = pdfrs::elements::parse_markdown(md);
        let layout = pdfrs::pdf_generator::PageLayout::portrait();
        let pdf_bytes = pdfrs::pdf_generator::generate_pdf_bytes(&elements, "Helvetica", 12.0, layout)
            .expect("pdfrs should generate a PDF from markdown");
        let out_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../__tests__/fixtures");
        std::fs::create_dir_all(&out_dir).unwrap();
        std::fs::write(out_dir.join("sample.pdf"), pdf_bytes).unwrap();
    }
}
