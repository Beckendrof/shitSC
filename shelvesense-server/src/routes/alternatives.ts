import { Router } from 'express';
import { suggestAlternatives } from '../services/alternativeService.js';
import { shelfSenseAi } from '../services/aiProvider.js';
import { validateBody, validated } from '../middleware/validateRequest.js';
import { alternativesBodySchema } from '../utils/schemas.js';
import type { z } from 'zod';

export const alternativesRouter = Router();

alternativesRouter.post('/', validateBody(alternativesBodySchema), async (req, res, next) => {
  try {
    const body = validated<z.infer<typeof alternativesBodySchema>>(req);
    const alternatives = await suggestAlternatives({
      ai: shelfSenseAi,
      currentProduct: body.currentProduct,
      verdict: body.verdict,
      health_flags: body.health_flags,
    });
    res.json({ alternatives });
  } catch (e) {
    next(e);
  }
});
