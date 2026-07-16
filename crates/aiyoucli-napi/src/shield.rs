/// Content shield — detects prompt injection, profanity, and sensitive patterns.

const SENSITIVE_PATTERNS: &[&str] = &[
    "ignore previous instructions",
    "ignore all instructions",
    "forget your instructions",
    "you are not bound",
    "you are free",
    "override your",
    "disregard your",
    "system prompt",
    "you must act as",
    "jailbreak",
    "dan mode",
    "developer mode",
];

const BLOCKED_KEYWORDS: &[&str] = &[
    "hack", "crack", "exploit", "vulnerability",
    "malware", "ransomware", "keylogger",
    "sql injection", "xss attack", "csrf",
];

#[derive(Debug, Clone)]
pub struct ShieldCheck {
    pub passed: bool,
    pub flags: Vec<ShieldFlag>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ShieldFlag {
    pub category: String,
    pub severity: String,
    pub pattern: String,
    pub position: Option<usize>,
}

pub struct Shield;

impl Shield {
    /// Check content against all shield rules.
    pub fn check(content: &str) -> ShieldCheck {
        let mut flags = Vec::new();
        let lower = content.to_lowercase();

        // Check prompt injection patterns
        for pattern in SENSITIVE_PATTERNS {
            if let Some(pos) = lower.find(pattern) {
                flags.push(ShieldFlag {
                    category: "prompt_injection".to_string(),
                    severity: "high".to_string(),
                    pattern: pattern.to_string(),
                    position: Some(pos),
                });
            }
        }

        // Check blocked keywords
        for kw in BLOCKED_KEYWORDS {
            if lower.contains(kw) {
                flags.push(ShieldFlag {
                    category: "blocked_keyword".to_string(),
                    severity: "medium".to_string(),
                    pattern: kw.to_string(),
                    position: None,
                });
            }
        }

        // Check for high-entropy strings (potential encoded payloads)
        let entropy = Self::shannon_entropy(content);
        if entropy > 6.0 {
            flags.push(ShieldFlag {
                category: "high_entropy".to_string(),
                severity: "low".to_string(),
                pattern: format!("entropy={:.2}", entropy),
                position: None,
            });
        }

        ShieldCheck {
            passed: flags.is_empty(),
            flags,
        }
    }

    /// Shannon entropy — higher values indicate more randomness.
    fn shannon_entropy(data: &str) -> f64 {
        if data.is_empty() {
            return 0.0;
        }
        let bytes = data.as_bytes();
        let len = bytes.len() as f64;
        let mut freq = [0u64; 256];
        for &b in bytes {
            freq[b as usize] += 1;
        }
        freq.iter()
            .filter(|&&c| c > 0)
            .map(|&c| {
                let p = c as f64 / len;
                -p * p.log2()
            })
            .sum()
    }
}
