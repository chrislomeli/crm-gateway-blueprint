/**
 * Retry utility for handling transient failures
 * Implements exponential backoff with jitter
 */

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (error: Error, attempt: number) => void;
  retryCondition?: (error: Error) => boolean;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    onRetry = () => {},
    retryCondition = (error) => {
      // Retry on rate limits and network errors
      const retryableCodes = [429, 502, 503, 504];
      return retryableCodes.includes(error['response']?.status);
    }
  } = options;

  let lastError: Error;
  let delay = retryDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries || !retryCondition(lastError)) {
        throw lastError;
      }

      onRetry(lastError, attempt + 1);

      // Calculate delay with exponential backoff and jitter
      const jitter = Math.random() * 1000;
      const actualDelay = Math.min(delay + jitter, maxDelay);
      
      // Handle rate limit headers if present
      const retryAfter = error['response']?.headers?.['retry-after'];
      if (retryAfter) {
        const retryDelayMs = parseInt(retryAfter) * 1000;
        await sleep(retryDelayMs);
      } else {
        await sleep(actualDelay);
      }

      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
