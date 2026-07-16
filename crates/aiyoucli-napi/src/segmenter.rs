/// Text segmenter — splits text into chunks for processing.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Segment {
    pub index: usize,
    pub content: String,
    pub char_count: usize,
    pub estimated_tokens: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SegmentationResult {
    pub segments: Vec<Segment>,
    pub total_chars: usize,
    pub total_tokens: usize,
    pub num_segments: usize,
    pub strategy: String,
}

fn estimate_tokens(text: &str) -> usize {
    (text.len() + 3) / 4
}

pub struct Segmenter;

impl Segmenter {
    /// Split text into fixed-size chunks with optional overlap.
    pub fn by_chunk_size(text: &str, chunk_size: usize, overlap: usize) -> SegmentationResult {
        let mut segments = Vec::new();
        let mut index = 0;
        let mut start = 0;

        while start < text.len() {
            let end = (start + chunk_size).min(text.len());
            let content = &text[start..end];
            segments.push(Segment {
                index,
                content: content.to_string(),
                char_count: content.len(),
                estimated_tokens: estimate_tokens(content),
            });
            index += 1;
            start += chunk_size - overlap;
        }

        let num_segments = index;
        let total_tokens: usize = segments.iter().map(|s| s.estimated_tokens).sum();

        SegmentationResult {
            segments,
            total_chars: text.len(),
            total_tokens,
            num_segments,
            strategy: format!("chunk_size={}, overlap={}", chunk_size, overlap),
        }
    }

    /// Split text by sentence boundaries (simple period-based heuristic).
    pub fn by_sentences(text: &str, max_chunk_chars: usize) -> SegmentationResult {
        let mut segments = Vec::new();
        let mut current = String::new();
        let mut index = 0;

        for sentence in text.split_inclusive(|c| c == '.' || c == '!' || c == '?') {
            let trimmed = sentence.trim();
            if trimmed.is_empty() {
                continue;
            }

            if current.len() + trimmed.len() > max_chunk_chars && !current.is_empty() {
                segments.push(Segment {
                    index,
                    content: current.trim().to_string(),
                    char_count: current.trim().len(),
                    estimated_tokens: estimate_tokens(current.trim()),
                });
                index += 1;
                current = String::new();
            }
            current.push_str(trimmed);
            current.push(' ');
        }

        if !current.trim().is_empty() {
            segments.push(Segment {
                index,
                content: current.trim().to_string(),
                char_count: current.trim().len(),
                estimated_tokens: estimate_tokens(current.trim()),
            });
        }

        let num_segments = segments.len();
        let total_tokens: usize = segments.iter().map(|s| s.estimated_tokens).sum();

        SegmentationResult {
            segments,
            total_chars: text.len(),
            total_tokens,
            num_segments,
            strategy: "by_sentence".to_string(),
        }
    }

    /// Split text by token count (estimated).
    pub fn by_tokens(text: &str, max_tokens: usize, overlap_tokens: usize) -> SegmentationResult {
        // Estimate: each token ~4 chars, but use the overlap as char offset
        let chunk_chars = max_tokens * 4;
        let overlap_chars = overlap_tokens * 4;
        Self::by_chunk_size(text, chunk_chars, overlap_chars)
    }
}
