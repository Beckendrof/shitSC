import { config } from '../config.js';
import { buildProfileParsePrompt } from '../utils/prompts.js';
import { healthProfileWireSchema, wireToProfile } from '../utils/schemas.js';
import type { HealthProfile } from '../types.js';
import type { AiProvider } from './aiProvider.js';
import { withExponentialBackoff } from './retryService.js';

const SYSTEM = 'You extract structured health constraints from lab text. Output JSON only.';

export async function parseLabReport(ai: AiProvider, rawText: string): Promise<HealthProfile> {
  const user = buildProfileParsePrompt(rawText);
  const jsonText = await withExponentialBackoff(
    () =>
      ai.completeJsonText({
        model: config.claude.textModel,
        system: SYSTEM,
        user,
        timeoutMs: config.ai.requestTimeoutMs,
      }),
    {
      maxRetries: config.ai.maxRetries,
      initialBackoffMs: config.ai.initialBackoffMs,
      maxBackoffMs: config.ai.maxBackoffMs,
      label: 'profile.parse',
    },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    throw Object.assign(new Error('Model returned non-JSON'), { code: 'PROFILE_PARSE_JSON' });
  }
  const wire = healthProfileWireSchema.safeParse(parsed);
  if (!wire.success) {
    throw Object.assign(new Error('Profile schema validation failed'), {
      code: 'PROFILE_PARSE_SCHEMA',
      details: wire.error.flatten(),
    });
  }
  return wireToProfile(wire.data);
}
