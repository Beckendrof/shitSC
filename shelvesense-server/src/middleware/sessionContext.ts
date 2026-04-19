import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../services/sessionStore.js';

const HEADER = 'x-shelvesense-session';

export function sessionContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(HEADER);
  const sessionId = incoming && incoming.length > 0 ? incoming : uuidv4();
  if (!incoming) {
    res.setHeader(HEADER, sessionId);
  }
  req.shelfSenseSessionId = sessionId;
  req.shelfSenseSession = getSession(sessionId);
  next();
}
