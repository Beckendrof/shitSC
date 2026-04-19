import { healthProfileWireSchema, wireToProfile } from '../utils/schemas.js';
import type { HealthProfile, Verdict } from '../types.js';
import { ocrImageBuffer } from './ocrService.js';
import { verdictFromRealWorldHeuristicOcr } from './realWorldOcrHeuristic.js';

function extractProfileFromLabelPrompt(promptText: string): HealthProfile | null {
  const m = promptText.match(/User health profile \(JSON\):\s*\n(\{[\s\S]*?\})\s*\n/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as unknown;
    const w = healthProfileWireSchema.parse(raw);
    return wireToProfile(w);
  } catch {
    return null;
  }
}

function hasPeanutAllergy(profile: HealthProfile): boolean {
  return profile.allergies.some((a) => a.toLowerCase().includes('peanut'));
}

function profileWantsStrictSugarSodium(profile: HealthProfile): boolean {
  const s = profile.sodiumSensitivity.toLowerCase();
  const g = profile.sugarSensitivity.toLowerCase();
  const b = profile.bloodSugar.toLowerCase();
  return (s.includes('limit') || s.includes('high')) && (g.includes('elevated') || g.includes('limit') || b.includes('at-risk'));
}

type HeuristicParts = {
  verdict: Verdict;
  reason: string;
  ingredients_flags: string[];
  health_risks: string[];
};

/**
 * SSAMPLE_* synthetic fixtures (`scripts/generate-samples.cjs`).
 * Returns null when OCR is from real packaging instead.
 */
export function verdictFromSyntheticFixtureOcr(ocr: string, profile: HealthProfile): HeuristicParts | null {
  const u = ocr.toUpperCase().replace(/\s+/g, ' ').trim();

  if (u.includes('SSAMPLE ALLERGEN') || (u.includes('SSAMPLE') && u.includes('PEANUT') && hasPeanutAllergy(profile))) {
    return {
      verdict: 'Avoid',
      reason: 'Fixture marks allergen risk while your profile lists a peanut allergy.',
      ingredients_flags: ['peanut-related wording', 'cross-contact risk'],
      health_risks: ['Allergen exposure'],
    };
  }

  if (u.includes('SSAMPLE SALT')) {
    const verdict: Verdict = profileWantsStrictSugarSodium(profile) ? 'Avoid' : 'Caution';
    return {
      verdict,
      reason:
        verdict === 'Avoid'
          ? 'High sodium and added sugar exceed the stricter limits in your combined profile.'
          : 'High sodium and added sugar versus your profile — use sparingly.',
      ingredients_flags: ['high sodium', 'added sugar'],
      health_risks: verdict === 'Avoid' ? ['Sodium load', 'Glycemic load'] : ['Sodium load', 'Sugar spike'],
    };
  }

  if (u.includes('SSAMPLE HEALTH')) {
    return {
      verdict: 'Safe',
      reason: 'Simple ingredients with modest sugar and sodium for your profile.',
      ingredients_flags: ['short ingredient list', 'fiber-forward'],
      health_risks: [],
    };
  }

  return null;
}

/** @deprecated use verdictFromSyntheticFixtureOcr — kept for any external imports */
export function verdictFromShelfSampleOcr(ocr: string, profile: HealthProfile): HeuristicParts {
  return verdictFromSyntheticFixtureOcr(ocr, profile) ?? verdictFromRealWorldHeuristicOcr(ocr, profile);
}

export function buildFullLabelJsonFromHeuristicParts(parts: {
  verdict: Verdict;
  reason: string;
  ingredients_flags: string[];
  health_risks: string[];
}): string {
  return JSON.stringify({
    verdict: parts.verdict,
    reason: parts.reason,
    ingredients_flags: parts.ingredients_flags,
    macro_breakdown: {
      calories: 'see label',
      protein: 'see label',
      carbs: 'see label',
      fat: 'see label',
      sugar: 'see label',
      sodium: 'see label',
    },
    health_risks: parts.health_risks,
    better_alternatives: [
      { name: 'Plain staple alternative', why_better: 'Fewer additives when you trade down to single-ingredient foods.' },
      { name: 'Lower-sodium pick', why_better: 'Choose no-salt-added versions in the same aisle.' },
      { name: 'Lower-sugar pick', why_better: 'Compare added sugar grams per serving across brands.' },
    ],
    cart_impact: {
      summary: 'Heuristic scan — refine with cloud vision for production.',
      running_score: 'offline',
    },
    meal_plan_hint: 'Plate method: half veg, quarter lean protein, quarter whole grains.',
  });
}

type VisionUserPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export async function mockVisionJsonFromImageAndPrompt(userParts: VisionUserPart[]): Promise<string> {
  const textPart = userParts.find((p): p is { type: 'text'; text: string } => p.type === 'text');
  const imgPart = userParts.find((p): p is { type: 'image_url'; image_url: { url: string } } => p.type === 'image_url');
  if (!textPart || !imgPart || imgPart.type !== 'image_url') {
    return JSON.stringify({ _failure: 'UNREADABLE_LABEL', _failure_detail: 'Missing text or image in request.' });
  }
  const profile = extractProfileFromLabelPrompt(textPart.text);
  if (!profile) {
    return JSON.stringify({ _failure: 'UNREADABLE_LABEL', _failure_detail: 'Could not parse embedded health profile.' });
  }
  const url = imgPart.image_url.url;
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0) {
    return JSON.stringify({ _failure: 'UNREADABLE_LABEL', _failure_detail: 'Expected data URL image.' });
  }
  const buf = Buffer.from(url.slice(comma + 1), 'base64');
  let ocr = '';
  try {
    ocr = await ocrImageBuffer(buf);
  } catch {
    ocr = '';
  }
  if (!ocr || ocr.length < 8) {
    return JSON.stringify({ _failure: 'UNREADABLE_LABEL', _failure_detail: 'OCR returned empty text.' });
  }
  const parts = verdictFromSyntheticFixtureOcr(ocr, profile) ?? verdictFromRealWorldHeuristicOcr(ocr, profile);
  return buildFullLabelJsonFromHeuristicParts(parts);
}
