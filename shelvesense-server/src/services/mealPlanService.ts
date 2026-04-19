import { z } from 'zod';
import { config } from '../config.js';
import { buildMealPlanPrompt } from '../utils/prompts.js';
import type { HealthProfile, MealPlanResult } from '../types.js';
import type { AiProvider } from './aiProvider.js';
import { withExponentialBackoff } from './retryService.js';

const SYSTEM = 'You plan budget meals. JSON only.';

const resultSchema = z.object({
  meals: z
    .array(
      z.object({
        title: z.string(),
        ingredients: z.array(z.string()),
        rationale: z.string(),
        estimated_cost_band: z.enum(['low', 'medium', 'high']),
      }),
    )
    .min(1),
});

export async function generateMealPlan(params: {
  ai: AiProvider;
  profile: HealthProfile;
  cartSummary: string;
  budgetTarget: string;
}): Promise<MealPlanResult> {
  const user = buildMealPlanPrompt({
    profile: params.profile,
    cartSummary: params.cartSummary,
    budgetTarget: params.budgetTarget,
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
      label: 'mealPlan',
    },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    throw Object.assign(new Error('Meal plan non-JSON'), { code: 'MEAL_NON_JSON' });
  }
  const meals = resultSchema.safeParse(parsed);
  if (!meals.success) {
    throw Object.assign(new Error('Meal plan schema failed'), {
      code: 'MEAL_SCHEMA',
      details: meals.error.flatten(),
    });
  }
  return { meals: meals.data.meals.slice(0, 3).map((m) => ({ ...m, ingredients: m.ingredients.slice(0, 10) })) };
}
