export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  jitter?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  backoffFactor: number,
  jitter: boolean,
): number {
  const exponentialDelay = baseDelay * Math.pow(backoffFactor, attempt);
  const capped = Math.min(exponentialDelay, maxDelay);

  if (!jitter) return capped;

  return Math.random() * capped;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 30_000;
  const backoffFactor = options?.backoffFactor ?? 2;
  const jitter = options?.jitter ?? true;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;

      const delay = calculateDelay(attempt, baseDelay, maxDelay, backoffFactor, jitter);
      await sleep(delay);
    }
  }

  throw lastError;
}
