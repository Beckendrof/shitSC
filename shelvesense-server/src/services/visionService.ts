import { config } from '../config.js';
import { buildLabelAnalysisPrompt } from '../utils/prompts.js';
import { labelAnalysisModelSchema, labelAnalysisResponseSchema } from '../utils/schemas.js';
import type { HealthProfile, LabelAnalysis } from '../types.js';
import type { AiProvider } from './aiProvider.js';
import { withExponentialBackoff } from './retryService.js';

const SYSTEM =
  'You are a precise label reader for grocery AR. Follow user instructions exactly. JSON only.';

function cap<T>(arr: T[] | undefined, n: number): T[] {
  return (arr ?? []).slice(0, n);
}

export class UnreadableImageError extends Error {
  readonly code = 'UNREADABLE_LABEL' as const;
  constructor(detail: string) {
    super(detail);
    this.name = 'UnreadableImageError';
  }
}

export async function analyzeProductLabel(params: {
  ai: AiProvider;
  imageBuffer: Buffer;
  imageMimeType: string;
  profile: HealthProfile;
  productName?: string;
  cartContext?: string;
}): Promise<LabelAnalysis> {
  const b64 = params.imageBuffer.toString('base64');
  const dataUrl = `data:${params.imageMimeType};base64,${b64}`;

  const userText = buildLabelAnalysisPrompt({
    profile: params.profile,
    productName: params.productName,
    cartContext: params.cartContext,
  });

  const jsonText = await withExponentialBackoff(
    () =>
      params.ai.completeJsonVision({
        model: config.claude.visionModel,
        system: SYSTEM,
        userParts: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
        timeoutMs: config.ai.requestTimeoutMs,
      }),
    {
      maxRetries: config.ai.maxRetries,
      initialBackoffMs: config.ai.initialBackoffMs,
      maxBackoffMs: config.ai.maxBackoffMs,
      label: 'label.analyze',
    },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    throw Object.assign(new Error('Model returned non-JSON'), { code: 'LABEL_NON_JSON' });
  }

  const model = labelAnalysisModelSchema.safeParse(parsed);
  if (!model.success) {
    throw Object.assign(new Error('Label model shape invalid'), {
      code: 'LABEL_SCHEMA',
      details: model.error.flatten(),
    });
  }

  const m = model.data;
  if (m._failure === 'UNREADABLE_LABEL' || m._failure === 'UNCERTAIN_PARSE') {
    throw new UnreadableImageError(m._failure_detail ?? 'Label not readable');
  }

  const coerceVerdict = (v: unknown): 'Safe' | 'Caution' | 'Avoid' =>
    v === 'Safe' || v === 'Caution' || v === 'Avoid' ? v : 'Caution';

  const normalized = {
    verdict: coerceVerdict(m.verdict),
    reason: m.reason ?? 'Unable to confirm details — treating as caution.',
    ingredients_flags: cap(m.ingredients_flags, 8),
    macro_breakdown: m.macro_breakdown ?? {
      calories: 'unknown',
      protein: 'unknown',
      carbs: 'unknown',
      fat: 'unknown',
      sugar: 'unknown',
      sodium: 'unknown',
    },
    health_risks: cap(m.health_risks, 6),
    better_alternatives: cap(m.better_alternatives, 3),
    cart_impact: m.cart_impact ?? {
      summary: 'Impact unknown for this scan.',
      running_score: 'n/a',
    },
    meal_plan_hint: m.meal_plan_hint ?? '',
  };

  const final = labelAnalysisResponseSchema.safeParse(normalized);
  if (!final.success) {
    throw Object.assign(new Error('Final label validation failed'), {
      code: 'LABEL_FINAL_SCHEMA',
      details: final.error.flatten(),
    });
  }
  return final.data;
}
