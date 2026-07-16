/// Request/response compressor — reduces token usage via smart pruning.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CompressionResult {
    pub original_tokens: usize,
    pub compressed_tokens: usize,
    pub ratio: f64,
    pub method: String,
}

/// Token estimate: ~4 chars per token
fn estimate_tokens(text: &str) -> usize {
    (text.len() + 3) / 4
}

pub struct Compressor;

impl Compressor {
    /// Truncate from the middle, keeping head and tail intact.
    pub fn truncate_middle(text: &str, max_chars: usize, head_ratio: f64) -> String {
        if text.len() <= max_chars {
            return text.to_string();
        }

        let head_len = (max_chars as f64 * head_ratio) as usize;
        let tail_len = max_chars - head_len - 3; // 3 for "..."

        let head: String = text.chars().take(head_len).collect();
        let tail: String = text.chars().skip(text.len().saturating_sub(tail_len)).collect();

        format!("{}...{}", head, tail)
    }

    /// Remove redundant whitespace and newlines.
    pub fn normalize_whitespace(text: &str) -> String {
        let mut result = String::with_capacity(text.len());
        let mut prev_was_space = false;
        let mut prev_was_newline = false;

        for ch in text.chars() {
            match ch {
                '\n' => {
                    if !prev_was_newline {
                        result.push('\n');
                        prev_was_newline = true;
                        prev_was_space = false;
                    }
                }
                ' ' | '\t' => {
                    if !prev_was_space && !prev_was_newline {
                        result.push(' ');
                        prev_was_space = true;
                    }
                }
                _ => {
                    result.push(ch);
                    prev_was_space = false;
                    prev_was_newline = false;
                }
            }
        }
        result
    }

    /// Compress messages by removing low-value turns and truncating long messages.
    pub fn compress_messages(
        messages: &[crate::llm::ChatMessage],
        max_messages: usize,
        max_message_chars: usize,
    ) -> CompressionResult {
        let original_tokens: usize = messages
            .iter()
            .map(|m| estimate_tokens(&m.content))
            .sum();

        let compressed: Vec<crate::llm::ChatMessage> = if messages.len() > max_messages {
            // Keep system prompt (first), then last N-1 messages
            let mut kept = Vec::with_capacity(max_messages);
            if messages[0].role == "system" {
                kept.push(messages[0].clone());
                let remaining = max_messages - 1;
                let start = messages.len().saturating_sub(remaining);
                kept.extend_from_slice(&messages[start..]);
            } else {
                let start = messages.len().saturating_sub(max_messages);
                kept.extend_from_slice(&messages[start..]);
            }
            kept
        } else {
            messages.to_vec()
        };

        // Truncate individual long messages
        let compressed: Vec<crate::llm::ChatMessage> = compressed
            .into_iter()
            .map(|m| {
                if m.content.len() > max_message_chars {
                    crate::llm::ChatMessage {
                        role: m.role,
                        content: Self::truncate_middle(&m.content, max_message_chars, 0.4),
                    }
                } else {
                    m
                }
            })
            .collect();

        let compressed_tokens: usize = compressed
            .iter()
            .map(|m| estimate_tokens(&m.content))
            .sum();

        let ratio = if original_tokens > 0 {
            compressed_tokens as f64 / original_tokens as f64
        } else {
            1.0
        };

        CompressionResult {
            original_tokens,
            compressed_tokens,
            ratio,
            method: "truncate+prune".to_string(),
        }
    }

    /// Analyze compression efficiency.
    pub fn analyze(text: &str) -> serde_json::Value {
        let tokens = estimate_tokens(text);
        let chars = text.len();
        let whitespace_pct = if chars > 0 {
            text.chars().filter(|c| c.is_whitespace()).count() as f64 / chars as f64 * 100.0
        } else {
            0.0
        };

        serde_json::json!({
            "chars": chars,
            "estimated_tokens": tokens,
            "tokens_per_char": if chars > 0 { format!("{:.2}", tokens as f64 / chars as f64) } else { "0".to_string() },
            "whitespace_pct": format!("{:.1}%", whitespace_pct),
            "compression_targets": {
                "truncate_middle_75": Self::truncate_middle(text, (chars * 75 / 100).max(1), 0.4).len(),
                "normalized": Self::normalize_whitespace(text).len(),
            },
        })
    }
}
