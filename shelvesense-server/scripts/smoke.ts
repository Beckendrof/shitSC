/**
 * Smoke checks against a running server. Run: `npm run dev` in another terminal, then `npm run smoke`.
 */
import fs from 'fs';
import path from 'path';

const base = (process.env.SMOKE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');

async function must200(name: string, res: Response): Promise<string> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${name} failed ${res.status}: ${text.slice(0, 400)}`);
  }
  return text;
}

async function main(): Promise<void> {
  const h = await fetch(`${base}/health`);
  await must200('GET /health', h);

  const session = `smoke-${Date.now()}`;
  const headers = { 'Content-Type': 'application/json', 'x-shelvesense-session': session };

  const parse = await fetch(`${base}/api/profile/parse`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      rawText: 'LDL 165. HbA1c 6.2%. Allergy: peanut. Low sodium diet. Vitamin D low.',
    }),
  });
  await must200('POST /api/profile/parse', parse);

  const samplePath = path.join(process.cwd(), '..', 'samples', 'label-healthy.jpg');
  if (fs.existsSync(samplePath)) {
    const imageB64 = fs.readFileSync(samplePath).toString('base64');
    const label = await fetch(`${base}/api/analyze-label`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        imageBase64: imageB64,
        imageMimeType: 'image/jpeg',
        healthProfile: {
          cholesterol: 'high',
          bloodSugar: 'normal',
          allergies: ['peanut'],
          deficiencies: [],
          sodiumSensitivity: 'limit',
          sugarSensitivity: 'limit',
          dietaryConstraints: [],
          notes: '',
        },
      }),
    });
    const labelBody = await must200('POST /api/analyze-label', label);
    const labelJson = JSON.parse(labelBody) as { verdict: string };
    if (!['Safe', 'Caution', 'Avoid'].includes(labelJson.verdict)) {
      throw new Error(`unexpected verdict: ${labelJson.verdict}`);
    }
  } else {
    console.warn('SMOKE: skipping analyze-label (no ../samples/label-healthy.jpg — run npm run samples:generate).');
  }

  const speech = await fetch(`${base}/api/speech`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'Caution. Watch sodium and added sugar.' }),
  });
  const speechBody = await must200('POST /api/speech', speech);
  const speechJson = JSON.parse(speechBody) as { spokenLine?: string; audioBase64?: string; fallback?: string };
  if (!speechJson.spokenLine) throw new Error('speech missing spokenLine');

  console.log('SMOKE OK', { base, speechBytes: speechJson.audioBase64?.length ?? 0 });
}

main().catch((e) => {
  console.error('SMOKE FAILED', e);
  process.exit(1);
});
