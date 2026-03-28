export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMax?: number;
}

export interface CircuitBreakerStats {
  failures: number;
  successes: number;
  state: CircuitState;
  lastFailure?: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailure?: number;
  private halfOpenAttempts = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenMax: number;

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.resetTimeout = options?.resetTimeout ?? 30_000;
    this.halfOpenMax = options?.halfOpenMax ?? 1;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.shouldAttemptReset()) {
        this.state = "half_open";
        this.halfOpenAttempts = 0;
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    if (this.state === "half_open" && this.halfOpenAttempts >= this.halfOpenMax) {
      throw new Error("Circuit breaker half-open limit reached");
    }

    try {
      if (this.state === "half_open") {
        this.halfOpenAttempts++;
      }
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    if (this.state === "open" && this.shouldAttemptReset()) {
      return "open";
    }
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      failures: this.failures,
      successes: this.successes,
      state: this.state,
      ...(this.lastFailure !== undefined && { lastFailure: this.lastFailure }),
    };
  }

  reset(): void {
    this.state = "closed";
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = undefined;
    this.halfOpenAttempts = 0;
  }

  private onSuccess(): void {
    this.successes++;
    if (this.state === "half_open") {
      this.state = "closed";
      this.failures = 0;
      this.halfOpenAttempts = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.state === "half_open") {
      this.state = "open";
      this.halfOpenAttempts = 0;
    } else if (this.failures >= this.failureThreshold) {
      this.state = "open";
    }
  }

  private shouldAttemptReset(): boolean {
    if (this.lastFailure === undefined) return false;
    return Date.now() - this.lastFailure >= this.resetTimeout;
  }
}
