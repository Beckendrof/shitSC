/**
 * ShelfSense lens ↔ backend contracts (mirror `shelvesense-server/src/types.ts` field names in JSON).
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

export interface CartUpdateResult {
  cart: CartState;
  healthTrendSummary: string;
  riskAlerts: string[];
}

export interface SpeechPayload {
  format: 'inline' | 'url';
  mimeType: 'audio/mpeg';
  audioBase64?: string;
  audioUrl?: string | null;
  spokenLine: string;
  fallback?: 'none' | 'browser_tts_hint';
}

export type ShelfSenseUiState = 'IDLE' | 'SCANNING' | 'ANALYZING' | 'DISPLAYING' | 'ERROR';

export interface ShelfSenseErrorInfo {
  message: string;
  code?: string;
}
