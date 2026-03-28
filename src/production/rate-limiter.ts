export interface RateLimiterOptions {
  maxTokens?: number;
  refillRate?: number;
  refillInterval?: number;
}

export interface RateLimiterStats {
  tokens: number;
  maxTokens: number;
}

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly refillInterval: number;
  private lastRefill: number;

  constructor(options?: RateLimiterOptions) {
    this.maxTokens = options?.maxTokens ?? 10;
    this.refillRate = options?.refillRate ?? 1;
    this.refillInterval = options?.refillInterval ?? 1000;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  acquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }

  async wait(): Promise<void> {
    while (!this.acquire()) {
      await new Promise((resolve) => setTimeout(resolve, this.refillInterval));
    }
  }

  getStats(): RateLimiterStats {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
    };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / this.refillInterval) * this.refillRate;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}
