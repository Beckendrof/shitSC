import type { SessionData } from './services/sessionStore.js';

declare module 'express-serve-static-core' {
  interface Request {
    shelfSenseSessionId: string;
    shelfSenseSession: SessionData;
  }
}

export {};
