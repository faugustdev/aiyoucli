/// Firewall — access control, rate limiting, origin validation.

use std::collections::HashMap;
use std::time::{Duration, Instant};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct FirewallRule {
    pub name: String,
    pub action: String,
    pub priority: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct FirewallCheck {
    pub allowed: bool,
    pub reason: Option<String>,
    pub matched_rule: Option<String>,
}

/// Simple token-bucket rate limiter.
pub struct RateLimiter {
    tokens: HashMap<String, BucketState>,
    capacity: u32,
    refill_rate: f64,
    refill_interval: Duration,
}

struct BucketState {
    tokens: f64,
    last_refill: Instant,
}

impl RateLimiter {
    pub fn new(capacity: u32, refill_per_sec: f64) -> Self {
        Self {
            tokens: HashMap::new(),
            capacity,
            refill_rate: refill_per_sec,
            refill_interval: Duration::from_secs(1),
        }
    }

    /// Check if a request from the given key should be allowed.
    pub fn check(&mut self, key: &str) -> bool {
        let now = Instant::now();
        let state = self.tokens.entry(key.to_string()).or_insert(BucketState {
            tokens: self.capacity as f64,
            last_refill: now,
        });

        // Refill tokens based on elapsed time
        let elapsed = now.duration_since(state.last_refill);
        let refill_cycles = (elapsed.as_secs_f64() * self.refill_rate) as u64;
        if refill_cycles > 0 {
            state.tokens = (state.tokens + refill_cycles as f64).min(self.capacity as f64);
            state.last_refill = now;
        }

        if state.tokens >= 1.0 {
            state.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

pub struct Firewall {
    rules: Vec<FirewallRule>,
    rate_limiter: RateLimiter,
    blocked_origins: Vec<String>,
}

impl Firewall {
    pub fn new() -> Self {
        Self {
            rules: vec![
                FirewallRule {
                    name: "allow_local".to_string(),
                    action: "allow".to_string(),
                    priority: 100,
                },
                FirewallRule {
                    name: "rate_limit".to_string(),
                    action: "rate_limit".to_string(),
                    priority: 50,
                },
                FirewallRule {
                    name: "block_unknown".to_string(),
                    action: "block".to_string(),
                    priority: 10,
                },
            ],
            rate_limiter: RateLimiter::new(60, 10.0),
            blocked_origins: Vec::new(),
        }
    }

    /// Check if a request is allowed through the firewall.
    pub fn check_request(&mut self, origin: &str, _path: &str) -> FirewallCheck {
        // Check if origin is explicitly blocked
        if self.blocked_origins.iter().any(|o| origin.contains(o)) {
            return FirewallCheck {
                allowed: false,
                reason: Some("Origin blocked".to_string()),
                matched_rule: Some("block_unknown".to_string()),
            };
        }

        // Allow localhost without rate limiting
        if origin == "127.0.0.1" || origin == "localhost" || origin == "::1" {
            return FirewallCheck {
                allowed: true,
                reason: None,
                matched_rule: Some("allow_local".to_string()),
            };
        }

        // Rate limit non-local origins
        if !self.rate_limiter.check(origin) {
            return FirewallCheck {
                allowed: false,
                reason: Some("Rate limit exceeded".to_string()),
                matched_rule: Some("rate_limit".to_string()),
            };
        }

        FirewallCheck {
            allowed: true,
            reason: None,
            matched_rule: Some("rate_limit".to_string()),
        }
    }

    /// Add an origin to the blocklist.
    pub fn block_origin(&mut self, origin: &str) {
        if !self.blocked_origins.contains(&origin.to_string()) {
            self.blocked_origins.push(origin.to_string());
        }
    }

    /// Remove an origin from the blocklist.
    pub fn unblock_origin(&mut self, origin: &str) {
        self.blocked_origins.retain(|o| o != origin);
    }

    pub fn rules(&self) -> &[FirewallRule] {
        &self.rules
    }

    pub fn blocked_origins(&self) -> &[String] {
        &self.blocked_origins
    }
}
