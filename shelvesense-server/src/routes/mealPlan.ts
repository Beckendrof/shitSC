import { Router } from 'express';
import { generateMealPlan } from '../services/mealPlanService.js';
import { shelfSenseAi } from '../services/aiProvider.js';
import { validateBody, validated } from '../middleware/validateRequest.js';
import { mealPlanBodySchema } from '../utils/schemas.js';
import type { z } from 'zod';

export const mealPlanRouter = Router();

mealPlanRouter.post('/', validateBody(mealPlanBodySchema), async (req, res, next) => {
  try {
    const body = validated<z.infer<typeof mealPlanBodySchema>>(req);
    const result = await generateMealPlan({
      ai: shelfSenseAi,
      profile: body.healthProfile,
      cartSummary: body.cartSummary,
      budgetTarget: body.budgetTarget,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});
