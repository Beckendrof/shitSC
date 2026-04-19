import path from 'path';
import 'dotenv/config';

function readNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const ttsEngineRaw = (process.env.TTS_ENGINE ?? 'auto').toLowerCase();
const ttsEngine: 'auto' | 'edge' = ttsEngineRaw === 'edge' || ttsEngineRaw === 'auto' ? ttsEngineRaw : 'auto';

const aiEngineRaw = (process.env.AI_ENGINE ?? 'claude').toLowerCase();
const aiEngine: 'auto' | 'claude' | 'mock' =
  aiEngineRaw === 'claude' || aiEngineRaw === 'mock' || aiEngineRaw === 'auto' ? aiEngineRaw : 'claude';

export const config = {
  port: readNumber('PORT', 8787),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,

  claude: {
    apiKey: process.env.CLAUDE_API_KEY ?? '',
    visionModel: process.env.CLAUDE_VISION_MODEL ?? 'claude-3-7-sonnet-latest',
    textModel: process.env.CLAUDE_TEXT_MODEL ?? 'claude-3-5-haiku-latest',
    maxTokens: readNumber('CLAUDE_MAX_TOKENS', 1600),
  },

  /**
   * Speech synthesis for `/api/speech`.
   * - `auto`: currently resolves to Edge TTS (Claude has no speech endpoint in this service).
   * - `edge`: always use Edge TTS (no cloud AI key needed for speech generation).
   */
  ttsEngine,
  ttsEdgeVoice: process.env.TTS_EDGE_VOICE ?? 'en-US-AriaNeural',

  /**
   * Multimodal AI provider selection.
   * - `auto`: Claude when CLAUDE_API_KEY is set, else built-in MockAiProvider (offline heuristics).
   * - `claude`: require API key.
   * - `mock`: always offline heuristics (CI / beginner laptops).
   */
  aiEngine,

  /** SQLite path for session cart + profile persistence. */
  sqlitePath: process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data', 'shelvesense.db'),

  /** Set false to force in-memory sessions only (no disk). */
  sqliteEnabled: (process.env.SQLITE_ENABLED ?? 'true').toLowerCase() !== 'false',

  ocrEnabled: (process.env.OCR_ENABLED ?? 'true').toLowerCase() !== 'false',

  /** When true, run retail-friendly sharp resize/normalize before tesseract (recommended for real shelves). */
  ocrPreprocess: (process.env.OCR_PREPROCESS ?? 'true').toLowerCase() !== 'false',

  ai: {
    maxRetries: readNumber('SHELFSENSE_AI_MAX_RETRIES', 4),
    initialBackoffMs: readNumber('SHELFSENSE_AI_BACKOFF_MS', 400),
    maxBackoffMs: readNumber('SHELFSENSE_AI_MAX_BACKOFF_MS', 8000),
    requestTimeoutMs: readNumber('SHELFSENSE_AI_TIMEOUT_MS', 120000),
  },

  upload: {
    maxImageBytes: readNumber('SHELFSENSE_MAX_IMAGE_BYTES', 12 * 1024 * 1024),
  },
};

export function assertClaudeConfigured(): void {
  if (!config.claude.apiKey) {
    const err = new Error('CLAUDE_API_KEY is not set');
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
}
