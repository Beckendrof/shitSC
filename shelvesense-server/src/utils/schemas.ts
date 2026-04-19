import { z } from 'zod';
import type { Verdict } from '../types.js';

export const verdictSchema: z.ZodType<Verdict> = z.enum(['Safe', 'Caution', 'Avoid']);

export const healthProfileSchema = z.object({
  cholesterol: z.string(),
  bloodSugar: z.string(),
  allergies: z.array(z.string()),
  deficiencies: z.array(z.string()),
  sodiumSensitivity: z.string(),
  sugarSensitivity: z.string(),
  dietaryConstraints: z.array(z.string()),
  notes: z.string(),
});

export const healthProfileWireSchema = z.object({
  cholesterol: z.string(),
  blood_sugar: z.string(),
  allergies: z.array(z.string()),
  deficiencies: z.array(z.string()),
  sodium_sensitivity: z.string(),
  sugar_sensitivity: z.string(),
  dietary_constraints: z.array(z.string()),
  notes: z.string(),
});

export function wireToProfile(w: z.infer<typeof healthProfileWireSchema>) {
  return {
    cholesterol: w.cholesterol,
    bloodSugar: w.blood_sugar,
    allergies: w.allergies,
    deficiencies: w.deficiencies,
    sodiumSensitivity: w.sodium_sensitivity,
    sugarSensitivity: w.sugar_sensitivity,
    dietaryConstraints: w.dietary_constraints,
    notes: w.notes,
  };
}

export const macroBreakdownSchema = z.object({
  calories: z.string(),
  protein: z.string(),
  carbs: z.string(),
  fat: z.string(),
  sugar: z.string(),
  sodium: z.string(),
});

export const betterAlternativeSchema = z.object({
  name: z.string(),
  why_better: z.string(),
});

export const cartImpactSchema = z.object({
  summary: z.string(),
  running_score: z.string(),
});

/** Internal model output — may include machine-readable failure. */
export const labelAnalysisModelSchema = z.object({
  _failure: z.enum(['UNREADABLE_LABEL', 'UNCERTAIN_PARSE']).optional(),
  _failure_detail: z.string().optional(),
  verdict: verdictSchema.optional(),
  reason: z.string().optional(),
  ingredients_flags: z.array(z.string()).optional(),
  macro_breakdown: macroBreakdownSchema.optional(),
  health_risks: z.array(z.string()).optional(),
  better_alternatives: z.array(betterAlternativeSchema).optional(),
  cart_impact: cartImpactSchema.optional(),
  meal_plan_hint: z.string().optional(),
});

export const labelAnalysisResponseSchema = z.object({
  verdict: verdictSchema,
  reason: z.string(),
  ingredients_flags: z.array(z.string()),
  macro_breakdown: macroBreakdownSchema,
  health_risks: z.array(z.string()),
  better_alternatives: z.array(betterAlternativeSchema),
  cart_impact: cartImpactSchema,
  meal_plan_hint: z.string(),
});

export const profileParseBodySchema = z.object({
  rawText: z.string().min(1, 'rawText is required'),
});

export const analyzeLabelJsonBodySchema = z.object({
  imageBase64: z.string().min(1),
  imageMimeType: z.string().default('image/jpeg'),
  healthProfile: healthProfileSchema,
  productName: z.string().optional(),
  cartContext: z
    .object({
      verdictCounts: z
        .object({
          Safe: z.number(),
          Caution: z.number(),
          Avoid: z.number(),
        })
        .optional(),
      trendSummary: z.string().optional(),
    })
    .optional(),
});

export const alternativesBodySchema = z.object({
  currentProduct: z.object({
    name: z.string().optional(),
    category: z.string().optional(),
    ingredients_flags: z.array(z.string()).optional(),
  }),
  verdict: verdictSchema,
  health_flags: z.array(z.string()),
});

export const cartUpdateBodySchema = z.object({
  latestItem: z.object({
    verdict: verdictSchema,
    productName: z.string().optional(),
    ingredients_flags: z.array(z.string()),
    health_risks: z.array(z.string()),
  }),
  cart: z
    .object({
      items: z.array(
        z.object({
          productName: z.string().optional(),
          verdict: verdictSchema,
          ingredients_flags: z.array(z.string()),
          capturedAt: z.string(),
        }),
      ),
      verdictCounts: z.object({
        Safe: z.number(),
        Caution: z.number(),
        Avoid: z.number(),
      }),
      allergenRisk: z.enum(['low', 'medium', 'high']),
      sugarBurden: z.enum(['low', 'medium', 'high']),
      sodiumBurden: z.enum(['low', 'medium', 'high']),
      trendSummary: z.string(),
    })
    .nullable(),
});

export const mealPlanBodySchema = z.object({
  healthProfile: healthProfileSchema,
  cartSummary: z.string(),
  budgetTarget: z.string(),
});

export const speechBodySchema = z.object({
  text: z.string().min(1).max(500),
});
