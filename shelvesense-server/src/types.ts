/**
 * Domain + API contract types for ShelfSense backend.
 * Keep in sync with `lens/src/types.ts` for the Spectacles client.
 */

export type Verdict = 'Safe' | 'Caution' | 'Avoid';

export interface HealthProfile {
  cholesterol: string;
  bloodSugar: string;
  allergies: string[];
  deficiencies: string[];
  sodiumSensitivity: string;
  sugarSensitivity: string;
  dietaryConstraints: string[];
  notes: string;
}

/** Flat JSON keys expected from lab parse (consumer-friendly strings). */
export interface HealthProfileWire {
  cholesterol: string;
  blood_sugar: string;
  allergies: string[];
  deficiencies: string[];
  sodium_sensitivity: string;
  sugar_sensitivity: string;
  dietary_constraints: string[];
  notes: string;
}

export interface MacroBreakdown {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  sugar: string;
  sodium: string;
}

export interface BetterAlternative {
  name: string;
  why_better: string;
}

export interface CartImpact {
  summary: string;
  running_score: string;
}

export interface LabelAnalysis {
  verdict: Verdict;
  reason: string;
  ingredients_flags: string[];
  macro_breakdown: MacroBreakdown;
  health_risks: string[];
  better_alternatives: BetterAlternative[];
  cart_impact: CartImpact;
  meal_plan_hint: string;
}

export interface CartLineItem {
  productName?: string;
  verdict: Verdict;
  ingredients_flags: string[];
  capturedAt: string;
}

export interface CartState {
  items: CartLineItem[];
  verdictCounts: { Safe: number; Caution: number; Avoid: number };
  allergenRisk: 'low' | 'medium' | 'high';
  sugarBurden: 'low' | 'medium' | 'high';
  sodiumBurden: 'low' | 'medium' | 'high';
  trendSummary: string;
}

export interface CartUpdateInput {
  latestItem: {
    verdict: Verdict;
    productName?: string;
    ingredients_flags: string[];
    health_risks: string[];
  };
  cart: CartState | null;
}

export interface CartUpdateResult {
  cart: CartState;
  healthTrendSummary: string;
  riskAlerts: string[];
}

export interface MealPlanMeal {
  title: string;
  ingredients: string[];
  rationale: string;
  estimated_cost_band: 'low' | 'medium' | 'high';
}

export interface MealPlanResult {
  meals: MealPlanMeal[];
}

export interface SpeechResult {
  /** `inline` = base64 body; `url` = playable URL (optional static hosting). */
  format: 'inline' | 'url';
  mimeType: 'audio/mpeg';
  /** Present when format is `inline` (Spectacles + demo decode this). */
  audioBase64?: string;
  /** Present when format is `url` — lens can fetch URL with RemoteMediaModule. */
  audioUrl?: string | null;
  /** Short line echoed for debugging / logging (not spoken metadata). */
  spokenLine: string;
  /**
   * When audio cannot be generated, clients may use browser Web Speech (demo page)
   * or on-device speech (lens) while still showing `spokenLine`.
   */
  fallback?: 'none' | 'browser_tts_hint';
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SessionSnapshot {
  profile: HealthProfile | null;
  cart: CartState;
}
