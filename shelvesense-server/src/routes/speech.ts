import { Router } from 'express';
import { synthesizeSpeechLine } from '../services/ttsService.js';
import { validateBody, validated } from '../middleware/validateRequest.js';
import { speechBodySchema } from '../utils/schemas.js';
import type { z } from 'zod';

export const speechRouter = Router();

speechRouter.post('/', validateBody(speechBodySchema), async (req, res, next) => {
  try {
    const body = validated<z.infer<typeof speechBodySchema>>(req);
    const audio = await synthesizeSpeechLine(body.text);
    res.json(audio);
  } catch (e) {
    next(e);
  }
});
