import { logger } from '../utils/logger.js';

export interface RetryOptions {
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  label: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRetryableAiError(err: unknown): boolean {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e.status;
  if (status === 429) return true;
  if (status === 408) return true;
  if (typeof status === 'number' && status >= 500) return true;
  const msg = (e.message ?? '').toLowerCase();
  if (msg.includes('timeout')) return true;
  if (msg.includes('econnreset')) return true;
  if (msg.includes('etimedout')) return true;
  if (e.code === 'ECONNABORTED') return true;
  return false;
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let attempt = 0;
  let backoff = options.initialBackoffMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      const retryable = isRetryableAiError(err);
      if (!retryable || attempt > options.maxRetries) {
        logger.warn({ err, attempt, label: options.label }, 'retry aborted');
        throw err;
      }
      logger.info({ attempt, backoff, label: options.label }, 'retrying after backoff');
      await sleep(backoff);
      backoff = Math.min(backoff * 2, options.maxBackoffMs);
    }
  }
}
