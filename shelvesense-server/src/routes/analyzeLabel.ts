import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { analyzeLabelJsonBodySchema, healthProfileSchema } from '../utils/schemas.js';
import { analyzeProductLabel } from '../services/visionService.js';
import { shelfSenseAi } from '../services/aiProvider.js';
import { z } from 'zod';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxImageBytes },
});

const multipartMetaSchema = z.object({
  healthProfile: z.string().min(1),
  productName: z.string().optional(),
  cartContext: z.string().optional(),
});

export const analyzeLabelRouter = Router();

analyzeLabelRouter.post(
  '/',
  (req, res, next) => {
    if (req.is('multipart/form-data')) {
      upload.single('image')(req, res, (err) => {
        if (err) {
          res.status(400).json({
            error: { code: 'UPLOAD_ERROR', message: err.message },
          });
          return;
        }
        next();
      });
      return;
    }
    next();
  },
  async (req, res, next) => {
    try {
      let imageBuffer: Buffer;
      let imageMimeType: string;
      let profile: z.infer<typeof healthProfileSchema>;
      let productName: string | undefined;
      let cartContext: string | undefined;

      if (req.file) {
        const meta = multipartMetaSchema.safeParse(req.body);
        if (!meta.success) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid multipart fields', details: meta.error.flatten() },
          });
          return;
        }
        let hp: unknown;
        try {
          hp = JSON.parse(meta.data.healthProfile) as unknown;
        } catch {
          res.status(400).json({ error: { code: 'INVALID_JSON', message: 'healthProfile must be JSON string' } });
          return;
        }
        const parsedProfile = healthProfileSchema.safeParse(hp);
        if (!parsedProfile.success) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'healthProfile invalid', details: parsedProfile.error.flatten() },
          });
          return;
        }
        profile = parsedProfile.data;
        productName = meta.data.productName;
        if (meta.data.cartContext) {
          try {
            const ctx = JSON.parse(meta.data.cartContext) as { trendSummary?: string };
            cartContext = typeof ctx.trendSummary === 'string' ? ctx.trendSummary : meta.data.cartContext;
          } catch {
            cartContext = meta.data.cartContext;
          }
        }
        imageBuffer = req.file.buffer;
        imageMimeType = req.file.mimetype || 'image/jpeg';
      } else {
        const parsed = analyzeLabelJsonBodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body', details: parsed.error.flatten() },
          });
          return;
        }
        imageBuffer = Buffer.from(parsed.data.imageBase64, 'base64');
        imageMimeType = parsed.data.imageMimeType;
        profile = parsed.data.healthProfile;
        productName = parsed.data.productName;
        cartContext = parsed.data.cartContext?.trendSummary;
      }

      const result = await analyzeProductLabel({
        ai: shelfSenseAi,
        imageBuffer,
        imageMimeType,
        profile,
        productName,
        cartContext,
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);
