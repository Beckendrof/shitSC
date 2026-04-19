import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { UnreadableImageError } from '../services/visionService.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    res.status(400).json({
      error: { code: 'UPLOAD_ERROR', message: err.message, details: { field: err.field } },
    });
    return;
  }

  if (err instanceof UnreadableImageError) {
    res.status(422).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid data',
        details: err.flatten(),
      },
    });
    return;
  }

  const e = err as { status?: number; code?: string; message?: string };
  const status = typeof e.status === 'number' ? e.status : 500;
  const code = e.code ?? (status >= 500 ? 'INTERNAL' : 'REQUEST_ERROR');
  const message = e.message ?? 'Unexpected error';

  if (status >= 500) {
    logger.error({ err: { message, code, stack: (err as Error).stack } }, 'server error');
  } else {
    logger.warn({ err: { message, code } }, 'client error');
  }

  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}
