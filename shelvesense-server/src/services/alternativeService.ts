import { z } from 'zod';
import { config } from '../config.js';
import { buildAlternativesPrompt } from '../utils/prompts.js';
import type { Verdict } from '../types.js';
import type { AiProvider } from './aiProvider.js';
import { withExponentialBackoff } from './retryService.js';

const SYSTEM = 'You suggest grocery swaps. JSON only. No markdown.';

const altSchema = z.array(
  z.object({
    name: z.string(),
    why_better: z.string(),
  }),
);

export async function suggestAlternatives(params: {
  ai: AiProvider;
  currentProduct: { name?: string; category?: string; ingredients_flags?: string[] };
  verdict: Verdict;
  health_flags: string[];
}): Promise<{ name: string; why_better: string }[]> {
  const user = buildAlternativesPrompt({
    currentProduct: params.currentProduct,
    verdict: params.verdict,
    health_flags: params.health_flags,
  });
  const jsonText = await withExponentialBackoff(
    () =>
      params.ai.completeJsonText({
        model: config.claude.textModel,
        system: SYSTEM,
        user,
        timeoutMs: config.ai.requestTimeoutMs,
      }),
    {
      maxRetries: config.ai.maxRetries,
      initialBackoffMs: config.ai.initialBackoffMs,
      maxBackoffMs: config.ai.maxBackoffMs,
      label: 'alternatives',
    },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    throw Object.assign(new Error('Alternatives non-JSON'), { code: 'ALT_NON_JSON' });
  }
  const arr = altSchema.safeParse(parsed);
  if (!arr.success) {
    throw Object.assign(new Error('Alternatives schema failed'), {
      code: 'ALT_SCHEMA',
      details: arr.error.flatten(),
    });
  }
  return arr.data.slice(0, 3);
}
