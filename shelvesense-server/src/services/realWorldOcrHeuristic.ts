import type { HealthProfile, Verdict } from '../types.js';

export type HeuristicVerdictParts = {
  verdict: Verdict;
  reason: string;
  ingredients_flags: string[];
  health_risks: string[];
};

function norm(ocr: string): string {
  return ocr.toUpperCase().replace(/\s+/g, ' ').trim();
}

function hasAllergy(profile: HealthProfile, needle: string): boolean {
  const n = needle.toLowerCase();
  return profile.allergies.some((a) => a.toLowerCase().includes(n));
}

/** Loose sodium mg signal from noisy OCR (e.g. "SODIUM 470MG", "SODIUM 1,040 MG"). */
function ocrShowsHighSodium(u: string): boolean {
  const m = u.match(/SODIUM[^0-9]{0,24}([0-9][0-9,]{2,})/);
  if (!m) return false;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n >= 280;
}

/** Added / total sugars in grams (two-digit+). */
function ocrShowsHighSugar(u: string): boolean {
  if (/\bHIGH\s+FRUCTOSE\b|\bHFCS\b|\bADDED\s+SUGARS?\b/.test(u)) return true;
  const m = u.match(/(?:TOTAL\s+)?SUGARS?[^0-9]{0,20}([0-9]{1,2})\s*G/);
  if (m) {
    const g = Number(m[1]);
    return Number.isFinite(g) && g >= 10;
  }
  return false;
}

function ocrShowsPeanutSignal(u: string): boolean {
  const lettersOnly = u.replace(/[^A-Z]/g, '');
  if (lettersOnly.includes('PEANUT')) return true;
  if (/\bPEANUT(S)?\b/.test(u) || u.includes('PEANUT BUTTER') || u.includes('PEANUTBUTTER')) return true;
  if (/\bPNUT\b/.test(u)) return true;
  /** Major US peanut-butter brands — strong retail signal when “PEANUT” OCR splits. */
  if (/\bSKIPPY\b/.test(u) || /\bSKIPP\b/.test(u) || /\bJIF\b/.test(u)) return true;
  /** Skippy-style “Peanut creamy Butter” marketing line — letters-only catches spaced OCR. */
  if (/\bCREAMY\b/.test(u) && /\bBUTTER\b/.test(u) && /\bPEAN\b/.test(u)) return true;
  return false;
}

function ocrShowsMilkSignal(u: string): boolean {
  return (
    /\bMILK\b/.test(u) ||
    /\bSUSU\b/.test(u) ||
    /\bDAIRY\b/.test(u) ||
    /\bLACTOSE\b/.test(u) ||
    /\bCONTAINS:?\s*MILK\b/.test(u) ||
    /\b2%\s+MILK\b/.test(u)
  );
}

function ocrShowsGlutenSignal(u: string): boolean {
  return /\bWHEAT\b/.test(u) || /\bGLUTEN\b/.test(u) || /\bBARLEY\b/.test(u);
}

/**
 * Offline heuristics for real packaging / shelf photos when AI_ENGINE=mock.
 * Complements SSAMPLE fixtures; tuned for Wikimedia `samples/real-products/` fetch set.
 */
export function verdictFromRealWorldHeuristicOcr(ocr: string, profile: HealthProfile): HeuristicVerdictParts {
  const u = norm(ocr);

  if (hasAllergy(profile, 'peanut') && ocrShowsPeanutSignal(u)) {
    return {
      verdict: 'Avoid',
      reason: 'Label text mentions peanuts while your profile lists a peanut allergy.',
      ingredients_flags: ['peanut wording on label'],
      health_risks: ['Allergen exposure'],
    };
  }

  /**
   * When OCR misses “PEANUT” but still reads “butter” on a jar/pouch front, offline mode errs
   * toward Avoid for peanut-allergy profiles. Must run before the short-OCR Caution branch.
   */
  if (
    hasAllergy(profile, 'peanut') &&
    u.length >= 12 &&
    /\bbutter\b/i.test(ocr) &&
    !/\bALMOND\b/i.test(ocr) &&
    !/\bSUNFLOWER\b/i.test(ocr) &&
    !/\bCASHEW\b/i.test(ocr)
  ) {
    return {
      verdict: 'Avoid',
      reason:
        'Offline mode: label OCR includes butter-style wording with a peanut allergy on file — assume peanut butter until cloud vision confirms.',
      ingredients_flags: ['likely nut spread', 'offline allergen caution'],
      health_risks: ['Allergen exposure'],
    };
  }

  if (hasAllergy(profile, 'milk') && ocrShowsMilkSignal(u)) {
    return {
      verdict: 'Avoid',
      reason: 'Dairy wording on the carton conflicts with a milk allergy on your profile.',
      ingredients_flags: ['dairy / milk'],
      health_risks: ['Allergen exposure'],
    };
  }

  if ((hasAllergy(profile, 'gluten') || hasAllergy(profile, 'wheat')) && ocrShowsGlutenSignal(u)) {
    return {
      verdict: 'Avoid',
      reason: 'Label references wheat/gluten while your profile flags gluten sensitivity.',
      ingredients_flags: ['wheat / gluten'],
      health_risks: ['Gluten exposure'],
    };
  }

  const short = u.length < 38;
  if (short) {
    return {
      verdict: 'Caution',
      reason: 'OCR only captured a short fragment — typical for blur, glare, motion, or distance.',
      ingredients_flags: ['low OCR confidence'],
      health_risks: ['Incomplete nutrition read'],
    };
  }

  const sugarHot = ocrShowsHighSugar(u);
  const sodiumHot = ocrShowsHighSodium(u);
  const sugarCare =
    profile.sugarSensitivity.toLowerCase().includes('elevated') ||
    profile.sugarSensitivity.toLowerCase().includes('limit') ||
    profile.bloodSugar.toLowerCase().includes('at-risk');
  const sodiumCare =
    profile.sodiumSensitivity.toLowerCase().includes('limit') ||
    profile.sodiumSensitivity.toLowerCase().includes('high');

  if (sugarCare && sugarHot) {
    const strict =
      sodiumCare &&
      sodiumHot &&
      (profile.bloodSugar.toLowerCase().includes('at-risk') || profile.sugarSensitivity.toLowerCase().includes('elevated'));
    const verdict: Verdict = strict ? 'Avoid' : 'Caution';
    const flags = ['added / total sugars'];
    if (sodiumHot) flags.push('sodium');
    return {
      verdict,
      reason: strict
        ? 'Label OCR shows high sugar and high sodium together versus your stricter profile.'
        : 'Label OCR shows elevated sugar versus your sugar-aware profile.',
      ingredients_flags: flags,
      health_risks: verdict === 'Avoid' ? ['Glycemic load', 'Sodium load'] : ['Glycemic load'],
    };
  }

  if (sodiumCare && sodiumHot) {
    return {
      verdict: 'Caution',
      reason: 'Label OCR shows triple-digit sodium versus your sodium-limit profile.',
      ingredients_flags: ['sodium'],
      health_risks: ['Sodium load'],
    };
  }

  if (u.includes('VITAMIN') && u.includes('MILK') && !hasAllergy(profile, 'milk') && !sugarHot && !sodiumHot) {
    return {
      verdict: 'Safe',
      reason: 'OCR looks like a plain milk nutrition panel with no flagged allergens for your profile.',
      ingredients_flags: ['dairy beverage', 'calcium / vitamin fortification'],
      health_risks: [],
    };
  }

  return {
    verdict: 'Caution',
    reason: 'Retail packaging OCR did not hit a decisive allergen or macro rule — treat as caution offline.',
    ingredients_flags: ['mixed retail OCR'],
    health_risks: ['Panel incomplete in OCR'],
  };
}
