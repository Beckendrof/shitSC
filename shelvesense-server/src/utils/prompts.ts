import type { HealthProfile } from '../types.js';

const STYLE = [
  'You are ShelfSense, a grocery shelf assistant for wearable AR.',
  'Use short, plain consumer language.',
  'Tie every conclusion to the user profile — no generic wellness tips.',
  'Prioritize: (1) allergens, (2) added sugar, (3) sodium, (4) saturated fat, (5) cholesterol-relevant fats, (6) fiber & protein positives.',
  'Flag ultra-processed patterns and concerning additives when visible.',
  'If the label is unreadable, too blurry, or missing nutrition/ingredients, respond ONLY with JSON containing _failure.',
  'If unsure about safety vs profile, verdict MUST be Caution.',
  'Output MUST be a single JSON object, no markdown, no code fences.',
].join('\n');

export function buildProfileParsePrompt(rawText: string): string {
  return [
    STYLE,
    '',
    'Task: Parse the lab report text into structured fields.',
    'Return JSON with EXACT keys:',
    '{"cholesterol":"string","blood_sugar":"string","allergies":["..."],"deficiencies":["..."],"sodium_sensitivity":"string","sugar_sensitivity":"string","dietary_constraints":["..."],"notes":"string"}',
    '',
    'Lab report text:',
    rawText.slice(0, 48000),
  ].join('\n');
}

export function profileJsonSchemaHint(): string {
  return '{"cholesterol":"","blood_sugar":"","allergies":[],"deficiencies":[],"sodium_sensitivity":"","sugar_sensitivity":"","dietary_constraints":[],"notes":""}';
}

export function formatHealthProfileForPrompt(profile: HealthProfile): string {
  return JSON.stringify(
    {
      cholesterol: profile.cholesterol,
      blood_sugar: profile.bloodSugar,
      allergies: profile.allergies,
      deficiencies: profile.deficiencies,
      sodium_sensitivity: profile.sodiumSensitivity,
      sugar_sensitivity: profile.sugarSensitivity,
      dietary_constraints: profile.dietaryConstraints,
      notes: profile.notes,
    },
    null,
    0,
  );
}

export function buildLabelAnalysisPrompt(params: {
  profile: HealthProfile;
  productName?: string;
  cartContext?: string;
}): string {
  const { profile, productName, cartContext } = params;
  return [
    STYLE,
    '',
    'Task: Analyze the product label image for this shopper.',
    'User health profile (JSON):',
    formatHealthProfileForPrompt(profile),
    productName ? `Optional product hint: ${productName}` : '',
    cartContext ? `Cart context: ${cartContext}` : '',
    '',
    'If the image is unreadable, return exactly:',
    '{"_failure":"UNREADABLE_LABEL","_failure_detail":"short reason"}',
    '',
    'Otherwise return exactly this shape (verdict is one of Safe, Caution, Avoid):',
    '{',
    '  "verdict": "Safe | Caution | Avoid",',
    '  "reason": "one short sentence",',
    '  "ingredients_flags": ["max ~6 short flags"],',
    '  "macro_breakdown": {',
    '    "calories": "estimate or unknown",',
    '    "protein": "",',
    '    "carbs": "",',
    '    "fat": "",',
    '    "sugar": "",',
    '    "sodium": ""',
    '  },',
    '  "health_risks": ["max 4, profile-specific"],',
    '  "better_alternatives": [',
    '    {"name":"product idea","why_better":"one line"},',
    '    ... up to 3',
    '  ],',
    '  "cart_impact": {',
    '    "summary": "one line how this item shifts the trip",',
    '    "running_score": "short score label like B+ or 6/10"',
    '  },',
    '  "meal_plan_hint": "one line meal idea using similar cuisine but healthier"',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildAlternativesPrompt(params: {
  currentProduct: { name?: string; category?: string; ingredients_flags?: string[] };
  verdict: string;
  health_flags: string[];
}): string {
  return [
    STYLE,
    '',
    'Task: Suggest 3 better grocery alternatives.',
    `Current product: ${JSON.stringify(params.currentProduct)}`,
    `Verdict: ${params.verdict}`,
    `Health flags: ${JSON.stringify(params.health_flags)}`,
    '',
    'Return JSON array of 3 objects:',
    '[{"name":"...","why_better":"..."}]',
  ].join('\n');
}

export function buildMealPlanPrompt(params: {
  profile: HealthProfile;
  cartSummary: string;
  budgetTarget: string;
}): string {
  return [
    STYLE,
    '',
    'Task: Propose 3 budget-friendly meals aligned with the profile.',
    'Prefer low-cost staples, minimize ultra-processed ingredients, lower sugar and sodium when possible.',
    `Budget target: ${params.budgetTarget}`,
    `Cart summary: ${params.cartSummary}`,
    'User profile JSON:',
    formatHealthProfileForPrompt(params.profile),
    '',
    'Return JSON:',
    '{"meals":[{"title":"...","ingredients":["...max 8"],"rationale":"one line","estimated_cost_band":"low|medium|high"}]}',
  ].join('\n');
}
