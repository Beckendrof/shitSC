import { config } from '../config.js';
import type { SpeechResult } from '../types.js';
import { logger } from '../utils/logger.js';
import { withExponentialBackoff } from './retryService.js';

function normalizeVerdictSpeech(text: string): string {
  const t = text.trim();
  if (t.length > 220) return `${t.slice(0, 217)}...`;
  return t;
}

/** Cloud TTS fallback path: Microsoft Edge read-aloud WebSocket (via `edge-tts` npm). */
async function synthesizeEdge(line: string): Promise<Buffer> {
  const { tts } = await import('edge-tts');
  return await withExponentialBackoff(
    () => tts(line, { voice: config.ttsEdgeVoice }),
    {
      maxRetries: config.ai.maxRetries,
      initialBackoffMs: config.ai.initialBackoffMs,
      maxBackoffMs: config.ai.maxBackoffMs,
      label: 'tts-edge',
    },
  );
}

export async function synthesizeSpeechLine(text: string): Promise<SpeechResult> {
  const line = normalizeVerdictSpeech(text);
  try {
    const buf = await synthesizeEdge(line);
    return {
      format: 'inline',
      mimeType: 'audio/mpeg',
      audioBase64: buf.toString('base64'),
      spokenLine: line,
      fallback: 'none',
    };
  } catch (err) {
    logger.warn({ err }, 'TTS failed — returning spoken line + client fallback hint');
    return {
      format: 'inline',
      mimeType: 'audio/mpeg',
      audioBase64: '',
      spokenLine: line,
      fallback: 'browser_tts_hint',
    };
  }
}
