import { shelfSenseLog } from './logger';

export interface HttpJsonOptions {
  method?: 'GET' | 'POST';
  path: string;
  body?: unknown;
  sessionId?: string | null;
  maxRetries?: number;
}

export interface HttpJsonError extends Error {
  status: number;
  bodySnippet: string;
}

export type Delayer = (ms: number) => Promise<void>;

/**
 * HTTP JSON helper for Spectacles using InternetModule.fetch.
 * Point `apiBaseUrl` at your Remote Service Gateway / tunnel (e.g. ngrok) + `/api`.
 */
export async function fetchJson<T>(
  internet: InternetModule,
  apiBaseUrl: string,
  opts: HttpJsonOptions,
  delay: Delayer,
): Promise<{ json: T; sessionHeader?: string }> {
  const maxRetries = opts.maxRetries ?? 3;
  const url = `${apiBaseUrl.replace(/\/$/, '')}${opts.path}`;
  const method = opts.method ?? 'POST';

  let backoff = 400;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (opts.sessionId) {
        headers['x-shelvesense-session'] = opts.sessionId;
      }

      const init: Record<string, unknown> = { method, headers };
      if (opts.body !== undefined && method !== 'GET') {
        init.body = JSON.stringify(opts.body);
      }

      const req = new Request(url, init as any);
      const res = await internet.fetch(req);

      const sessionHeader = res.headers.get('x-shelvesense-session') ?? undefined;
      const text = await res.text();
      if (res.status < 200 || res.status >= 300) {
        const err = new Error(`HTTP ${res.status}`) as HttpJsonError;
        err.status = res.status;
        err.bodySnippet = text.slice(0, 400);
        throw err;
      }
      const json = JSON.parse(text) as T;
      return { json, sessionHeader };
    } catch (err) {
      lastErr = err;
      const status = (err as HttpJsonError).status;
      const retryable = status === undefined || status >= 500 || status === 429;
      if (!retryable || attempt === maxRetries) {
        break;
      }
      shelfSenseLog('net', `retry ${attempt + 1}/${maxRetries} for ${opts.path}`);
      await delay(backoff);
      backoff = Math.min(backoff * 2, 5000);
    }
  }

  shelfSenseLog('net', `request failed ${url}`, `${lastErr}`);
  throw lastErr;
}
