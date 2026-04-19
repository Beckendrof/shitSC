/**
 * Small **synthetic** regression (SSAMPLE_* text fixtures in `samples/*.jpg`).
 * Primary real-world checks: `npm run verify:real` + `samples/real-products/`.
 *
 * Prerequisite terminal:
 *   cd shelvesense-server
 *   AI_ENGINE=mock OCR_ENABLED=true npm run dev
 *
 * Then:
 *   npm run samples:generate   # once, needs `sharp`
 *   npm run verify:samples
 *
 * On Windows PowerShell:
 *   $env:AI_ENGINE='mock'; $env:OCR_ENABLED='true'; npm run dev
 */
import fs from 'fs';
import path from 'path';

const base = (process.env.SMOKE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');

const samplesDir = path.join(process.cwd(), '..', 'samples');

const profileRelaxed = {
  cholesterol: 'borderline',
  bloodSugar: 'normal',
  allergies: [] as string[],
  deficiencies: [],
  sodiumSensitivity: 'unknown',
  sugarSensitivity: 'unknown',
  dietaryConstraints: [],
  notes: '',
};

const profileCautionSalt = {
  cholesterol: 'unknown',
  bloodSugar: 'normal',
  allergies: [] as string[],
  deficiencies: [],
  sodiumSensitivity: 'limit',
  sugarSensitivity: 'unknown',
  dietaryConstraints: [],
  notes: '',
};

const profileStrictSalt = {
  cholesterol: 'high',
  bloodSugar: 'at-risk',
  allergies: [] as string[],
  deficiencies: [],
  sodiumSensitivity: 'limit',
  sugarSensitivity: 'elevated',
  dietaryConstraints: [],
  notes: '',
};

const profilePeanut = {
  cholesterol: 'unknown',
  bloodSugar: 'normal',
  allergies: ['peanut'],
  deficiencies: [],
  sodiumSensitivity: 'unknown',
  sugarSensitivity: 'unknown',
  dietaryConstraints: [],
  notes: '',
};

function b64(file: string): string {
  const p = path.join(samplesDir, file);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p}. Run: npm run samples:generate`);
  }
  return fs.readFileSync(p).toString('base64');
}

async function postJson(
  session: string,
  urlPath: string,
  body: unknown,
): Promise<{ res: Response; json: unknown }> {
  const res = await fetch(`${base}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shelvesense-session': session,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  const h = await fetch(`${base}/health`);
  assert(h.ok, `/health failed ${h.status}`);

  const session = `verify-${Date.now()}`;

  const healthy = await postJson(session, '/api/analyze-label', {
    imageBase64: b64('label-healthy.jpg'),
    imageMimeType: 'image/jpeg',
    healthProfile: profileRelaxed,
  });
  assert(healthy.res.ok, `healthy analyze ${healthy.res.status}`);
  assert((healthy.json as { verdict?: string }).verdict === 'Safe', 'expected Safe on label-healthy');
  // eslint-disable-next-line no-console
  console.log('[verify:samples] label-healthy.jpg → verdict=Safe (synthetic SSAMPLE sanity)');

  const saltCaution = await postJson(session, '/api/analyze-label', {
    imageBase64: b64('label-high-sodium-sugar.jpg'),
    imageMimeType: 'image/jpeg',
    healthProfile: profileCautionSalt,
  });
  assert(saltCaution.res.ok, `salt caution analyze ${saltCaution.res.status}`);
  assert(
    (saltCaution.json as { verdict?: string }).verdict === 'Caution',
    'expected Caution on high-sodium label with mild profile',
  );
  // eslint-disable-next-line no-console
  console.log('[verify:samples] label-high-sodium-sugar.jpg + mild sodium profile → verdict=Caution');

  const saltAvoid = await postJson(session, '/api/analyze-label', {
    imageBase64: b64('label-high-sodium-sugar.jpg'),
    imageMimeType: 'image/jpeg',
    healthProfile: profileStrictSalt,
  });
  assert(saltAvoid.res.ok, `salt avoid analyze ${saltAvoid.res.status}`);
  assert(
    (saltAvoid.json as { verdict?: string }).verdict === 'Avoid',
    'expected Avoid on high-sodium label with strict combined profile',
  );
  // eslint-disable-next-line no-console
  console.log('[verify:samples] label-high-sodium-sugar.jpg + strict profile → verdict=Avoid');

  const allergen = await postJson(session, '/api/analyze-label', {
    imageBase64: b64('label-allergen-peanut.jpg'),
    imageMimeType: 'image/jpeg',
    healthProfile: profilePeanut,
  });
  assert(allergen.res.ok, `allergen analyze ${allergen.res.status}`);
  assert((allergen.json as { verdict?: string }).verdict === 'Avoid', 'expected Avoid on allergen fixture');
  // eslint-disable-next-line no-console
  console.log('[verify:samples] label-allergen-peanut.jpg + peanut allergy → verdict=Avoid');

  const speech = await postJson(session, '/api/speech', {
    text: 'Safe. Simple ingredients with modest sugar and sodium for your profile.',
  });
  assert(speech.res.ok, `speech ${speech.res.status}`);
  const sp = speech.json as { spokenLine?: string; audioBase64?: string; fallback?: string };
  assert(Boolean(sp.spokenLine), 'speech missing spokenLine');
  const hasAudio = Boolean(sp.audioBase64 && sp.audioBase64.length > 64);
  const hasFallback = sp.fallback === 'browser_tts_hint';
  assert(hasAudio || hasFallback, 'speech expected audio bytes or browser_tts_hint fallback');
  // eslint-disable-next-line no-console
  console.log(
    `[verify:samples] /api/speech → ${hasAudio ? `audio base64 length=${(sp.audioBase64 ?? '').length}` : 'fallback=browser_tts_hint'}`,
  );

  // eslint-disable-next-line no-console
  console.log('VERIFY SAMPLES OK', { base });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('VERIFY SAMPLES FAILED', e);
  process.exit(1);
});
