import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema, ZodTypeAny } from 'zod';

export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body validation failed',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    (req as Request & { validatedBody: unknown }).validatedBody = parsed.data;
    next();
  };
}

export function validated<T>(req: Request): T {
  return (req as Request & { validatedBody: T }).validatedBody;
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query validation failed',
          details: parsed.error.flatten(),
        },
      });
      return;
    }
    (req as Request & { validatedQuery: unknown }).validatedQuery = parsed.data;
    next();
  };
}

export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
