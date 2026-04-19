/**
 * Real-world packaging + shelf verification (not SSAMPLE text fixtures).
 *
 * Prereq: `npm run samples:real:fetch` then a running API:
 *   AI_ENGINE=mock OCR_ENABLED=true npm run dev
 *
 *   npm run verify:real
 */
import fs from 'fs';
import path from 'path';

const base = (process.env.SMOKE_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const realDir = path.join(process.cwd(), '..', 'samples', 'real-products');

const profilePeanutAllergy = {
  cholesterol: 'unknown',
  bloodSugar: 'normal',
  allergies: ['peanut'],
  deficiencies: [],
  sodiumSensitivity: 'unknown',
  sugarSensitivity: 'unknown',
  dietaryConstraints: [],
  notes: '',
};

const profileMilkAllergy = {
  cholesterol: 'unknown',
  bloodSugar: 'normal',
  allergies: ['milk'],
  deficiencies: [],
  sodiumSensitivity: 'unknown',
  sugarSensitivity: 'unknown',
  dietaryConstraints: [],
  notes: '',
};

const profileSugarWatch = {
  cholesterol: 'unknown',
  bloodSugar: 'at-risk',
  allergies: [],
  deficiencies: [],
  sodiumSensitivity: 'unknown',
  sugarSensitivity: 'elevated',
  dietaryConstraints: [],
  notes: '',
};

const profileSodiumWatch = {
  cholesterol: 'unknown',
  bloodSugar: 'normal',
  allergies: [],
  deficiencies: [],
  sodiumSensitivity: 'limit',
  sugarSensitivity: 'unknown',
  dietaryConstraints: [],
  notes: '',
};

const profileRelaxed = {
  cholesterol: 'unknown',
  bloodSugar: 'normal',
  allergies: [] as string[],
  deficiencies: [],
  sodiumSensitivity: 'unknown',
  sugarSensitivity: 'unknown',
  dietaryConstraints: [],
  notes: '',
};

type Case = {
  file: string;
  profile: typeof profilePeanutAllergy;
  minOcrChars: number;
  /** Verdict must be one of these (OCR noise tolerant). */
  verdictOneOf: readonly string[];
  /** At least one substring (case-insensitive) must appear in OCR raw text. */
  ocrHintAnyOf?: readonly string[];
  /** If hints miss (busy shelf OCR), allow enough Latin letter tokens as a fallback signal. */
  minLatinTokens?: number;
};

const cases: Case[] = [
  {
    file: 'cereal_box.jpg',
    profile: profileSugarWatch,
    minOcrChars: 18,
    verdictOneOf: ['Caution', 'Avoid'],
    ocrHintAnyOf: ['PUBLIX', 'SPECIAL', 'CEREAL', 'CHEEZ', 'PRING', 'MAHAT', 'RICE', 'AISLE', 'TAMPA', 'FLOR'],
    minLatinTokens: 12,
  },
  {
    file: 'snack_chips.jpg',
    profile: profileSodiumWatch,
    minOcrChars: 12,
    verdictOneOf: ['Caution', 'Avoid'],
    ocrHintAnyOf: ['CHIP', 'POTATO', 'CALOR', 'FAT', 'SOD', 'SALT', 'CARB', 'FRITO', 'LAY'],
    minLatinTokens: 8,
  },
  {
    file: 'sauce_ketchup.jpg',
    profile: profileSodiumWatch,
    minOcrChars: 12,
    verdictOneOf: ['Caution', 'Avoid'],
    ocrHintAnyOf: ['TOMATO', 'KETCH', 'VINEGAR', 'SUGAR', 'SOD', 'TOM', 'CHEF', 'QUALITY', 'PACKET'],
    minLatinTokens: 6,
  },
  {
    file: 'dairy_milk_carton.jpg',
    profile: profileMilkAllergy,
    minOcrChars: 12,
    verdictOneOf: ['Avoid'],
    ocrHintAnyOf: ['MILK', 'VITAMIN', 'CALCIUM', '2%', 'LOW', 'SUSU', 'GIZI', 'NUTR', 'INFOR'],
    minLatinTokens: 6,
  },
  {
    file: 'allergen_peanut_butter.jpg',
    profile: profilePeanutAllergy,
    minOcrChars: 10,
    verdictOneOf: ['Avoid'],
    ocrHintAnyOf: ['PEANUT', 'NUT', 'BUTTER', 'INGRED', 'SKIPPY', 'SKIPP', 'CREAMY', 'JIF'],
    minLatinTokens: 8,
  },
  {
    file: 'shelf_blurry_angle.jpg',
    profile: profileRelaxed,
    minOcrChars: 8,
    verdictOneOf: ['Caution'],
  },
  {
    file: 'dashcam_retail_motion.jpg',
    profile: profileRelaxed,
    minOcrChars: 12,
    verdictOneOf: ['Caution'],
    ocrHintAnyOf: ['PUBL', 'PHARM', 'DRIVE', 'DOUG', 'SQU', 'PHAR', 'PUB'],
    minLatinTokens: 10,
  },
];

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function postOcr(session: string, filePath: string, fileName: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: 'image/jpeg' });
  const fd = new FormData();
  fd.append('image', blob, fileName);
  const res = await fetch(`${base}/api/profile/ocr`, {
    method: 'POST',
    headers: { 'x-shelvesense-session': session },
    body: fd,
  });
  const text = await res.text();
  assert(res.ok, `OCR ${fileName} failed ${res.status}: ${text.slice(0, 300)}`);
  const j = JSON.parse(text) as { rawText?: string };
  assert(typeof j.rawText === 'string', 'OCR response missing rawText');
  return j.rawText;
}

async function postAnalyze(
  session: string,
  imageBase64: string,
  profile: Case['profile'],
): Promise<{ verdict: string; reason: string }> {
  const res = await fetch(`${base}/api/analyze-label`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shelvesense-session': session,
    },
    body: JSON.stringify({
      imageBase64,
      imageMimeType: 'image/jpeg',
      healthProfile: profile,
    }),
  });
  const text = await res.text();
  assert(res.ok, `analyze-label failed ${res.status}: ${text.slice(0, 400)}`);
  const j = JSON.parse(text) as { verdict: string; reason?: string };
  return { verdict: j.verdict, reason: typeof j.reason === 'string' ? j.reason : '' };
}

async function postSpeech(session: string, line: string): Promise<{ mode: 'mp3' | 'hint'; audioChars: number }> {
  const res = await fetch(`${base}/api/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shelvesense-session': session,
    },
    body: JSON.stringify({ text: line.slice(0, 240) }),
  });
  assert(res.ok, `speech ${res.status}`);
  const j = (await res.json()) as { spokenLine?: string; audioBase64?: string; fallback?: string };
  assert(Boolean(j.spokenLine), 'speech missing spokenLine');
  assert(
    (j.audioBase64 && j.audioBase64.length > 64) || j.fallback === 'browser_tts_hint',
    'speech expected audio or browser_tts_hint',
  );
  const audioChars = j.audioBase64?.length ?? 0;
  if (j.audioBase64 && j.audioBase64.length > 64) {
    return { mode: 'mp3', audioChars };
  }
  return { mode: 'hint', audioChars };
}

function logLine(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[verify:real] ${msg}`);
}

async function main(): Promise<void> {
  const h = await fetch(`${base}/health`);
  assert(h.ok, `/health ${h.status}`);

  if (!fs.existsSync(realDir)) {
    throw new Error(`Missing ${realDir}. Run: npm run samples:real:fetch`);
  }

  const session = `real-${Date.now()}`;
  logLine(`session=${session} base=${base}`);

  for (const c of cases) {
    const fp = path.join(realDir, c.file);
    assert(fs.existsSync(fp), `missing ${c.file} — run npm run samples:real:fetch`);

    const raw = await postOcr(session, fp, c.file);
    assert(raw.length >= c.minOcrChars, `${c.file}: OCR too short (${raw.length} < ${c.minOcrChars}). Snippet: ${raw.slice(0, 120)}`);
    let cueNote = `ocr_chars=${raw.length}`;
    if (c.ocrHintAnyOf?.length) {
      const u = raw.toUpperCase();
      const hitHint = c.ocrHintAnyOf.some((s) => u.includes(s.toUpperCase()));
      const tokens = raw.match(/[A-Za-z]{3,}/g) ?? [];
      const hitTokens = c.minLatinTokens !== undefined && tokens.length >= c.minLatinTokens;
      assert(
        hitHint || hitTokens,
        `${c.file}: OCR missing expected product cues ${c.ocrHintAnyOf.join(', ')}` +
          (c.minLatinTokens !== undefined ? ` (and < ${c.minLatinTokens} Latin tokens)` : '') +
          `. Got: ${raw.slice(0, 200)}…`,
      );
      cueNote += hitHint ? ' cue=keyword' : ' cue=latin_tokens';
    }
    logLine(`${c.file} | ${cueNote} | preview="${raw.replace(/\s+/g, ' ').trim().slice(0, 96)}…"`);

    const b64 = fs.readFileSync(fp).toString('base64');
    const { verdict, reason } = await postAnalyze(session, b64, c.profile);
    assert(
      c.verdictOneOf.includes(verdict),
      `${c.file}: verdict ${verdict} not in allowed ${c.verdictOneOf.join('|')}`,
    );
    logLine(`${c.file} | analyze-label verdict=${verdict} reason="${reason.replace(/\s+/g, ' ').trim().slice(0, 140)}"`);

    const speechLine = `${verdict}. ${reason}`.trim().slice(0, 220);
    const speech = await postSpeech(session, speechLine || `${verdict}. ShelfSense offline scan.`);
    logLine(
      `${c.file} | speech ${speech.mode === 'mp3' ? `MP3 base64_len=${speech.audioChars}` : `fallback=browser_tts_hint base64_len=${speech.audioChars}`}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log('VERIFY REAL OK', { base, cases: cases.length });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('VERIFY REAL FAILED', e);
  process.exit(1);
});
