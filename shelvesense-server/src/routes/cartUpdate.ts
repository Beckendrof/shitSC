import { Router } from 'express';
import { updateCartState } from '../services/cartService.js';
import { setSessionCart } from '../services/sessionStore.js';
import { validateBody, validated } from '../middleware/validateRequest.js';
import { cartUpdateBodySchema } from '../utils/schemas.js';
import type { z } from 'zod';

export const cartUpdateRouter = Router();

cartUpdateRouter.post('/', validateBody(cartUpdateBodySchema), (req, res) => {
  const body = validated<z.infer<typeof cartUpdateBodySchema>>(req);
  const result = updateCartState({
    latestItem: body.latestItem,
    cart: body.cart,
  });
  setSessionCart(req.shelfSenseSessionId, result.cart);
  res.json(result);
});
