import multer from 'multer';
import { Router } from 'express';
import { parseLabReport } from '../services/profileService.js';
import { setSessionProfile } from '../services/sessionStore.js';
import { shelfSenseAi } from '../services/aiProvider.js';
import { ocrImageBuffer } from '../services/ocrService.js';
import { validateBody, validated } from '../middleware/validateRequest.js';
import { profileParseBodySchema } from '../utils/schemas.js';
import { config } from '../config.js';
import type { z } from 'zod';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxImageBytes },
});

export const profileRouter = Router();

profileRouter.get('/', (req, res) => {
  res.json({ profile: req.shelfSenseSession.profile });
});

profileRouter.post('/parse', validateBody(profileParseBodySchema), async (req, res, next) => {
  try {
    const body = validated<z.infer<typeof profileParseBodySchema>>(req);
    const profile = await parseLabReport(shelfSenseAi, body.rawText);
    setSessionProfile(req.shelfSenseSessionId, profile);
    res.json({ profile });
  } catch (e) {
    next(e);
  }
});

/** OCR for lab report / label photo → raw text (then call POST /api/profile/parse). */
profileRouter.post('/ocr', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing multipart field "image"' } });
      return;
    }
    const text = await ocrImageBuffer(req.file.buffer);
    res.json({ rawText: text });
  } catch (e) {
    next(e);
  }
});
