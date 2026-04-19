import { config } from '../config.js';
import { logger } from '../utils/logger.js';

async function maybePreprocessForOcr(buffer: Buffer): Promise<Buffer> {
  if (!config.ocrPreprocess) return buffer;
  try {
    const sharp = (await import('sharp')).default;
    return sharp(buffer)
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .normalize({ lower: 1, upper: 99 })
      .sharpen({ sigma: 1.1 })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    logger.warn({ err }, 'OCR sharp preprocess unavailable — using raw buffer');
    return buffer;
  }
}

/**
 * Open-source OCR via tesseract.js (WASM). Heavy first run; good for lab snapshots / label photos.
 */
export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  if (!config.ocrEnabled) {
    const err = new Error('OCR is disabled (set OCR_ENABLED=true)');
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
  const prepared = await maybePreprocessForOcr(buffer);
  const { createWorker } = await import('tesseract.js');
  type WorkerHandle = Awaited<ReturnType<typeof createWorker>>;
  let worker: WorkerHandle | null = null;
  try {
    worker = await createWorker('eng');
    const result = await worker.recognize(prepared);
    return (result.data.text ?? '').trim();
  } catch (err) {
    logger.warn({ err }, 'tesseract OCR failed');
    const e = new Error('OCR failed — try clearer image or paste text into /api/profile/parse');
    (e as Error & { status?: number }).status = 422;
    throw e;
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore terminate errors */
      }
    }
  }
}
