import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { ensureDir } from '../utils/fileHelpers.js';
import type { CartState, HealthProfile } from '../types.js';
import { emptyCart } from './cartService.js';

export interface SessionData {
  profile: HealthProfile | null;
  cart: CartState;
}

type SqliteDb = InstanceType<typeof Database>;
let db: SqliteDb | null = null;
const memory = new Map<string, SessionData>();

function memoryGet(sessionId: string): SessionData {
  let s = memory.get(sessionId);
  if (!s) {
    s = { profile: null, cart: emptyCart() };
    memory.set(sessionId, s);
  }
  return s;
}

function rowToSession(profileJson: string | null, cartJson: string | null): SessionData {
  return {
    profile: profileJson ? (JSON.parse(profileJson) as HealthProfile) : null,
    cart: cartJson ? (JSON.parse(cartJson) as CartState) : emptyCart(),
  };
}

function persistSqlite(sessionId: string, data: SessionData): void {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT INTO shelvesense_sessions (id, profile_json, cart_json, updated_at)
    VALUES (@id, @profile, @cart, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      profile_json = excluded.profile_json,
      cart_json = excluded.cart_json,
      updated_at = datetime('now')
  `);
  stmt.run({
    id: sessionId,
    profile: data.profile ? JSON.stringify(data.profile) : null,
    cart: JSON.stringify(data.cart),
  });
}

/**
 * Call once at process startup. Uses SQLite when enabled; falls back to in-memory Map on failure.
 */
export function initSessionStore(): void {
  if (!config.sqliteEnabled) {
    logger.info('SQLite disabled — using in-memory sessions');
    return;
  }
  try {
    ensureDir(path.dirname(config.sqlitePath));
    db = new Database(config.sqlitePath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS shelvesense_sessions (
        id TEXT PRIMARY KEY,
        profile_json TEXT,
        cart_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    logger.info({ path: config.sqlitePath }, 'session sqlite ready');
  } catch (err) {
    db = null;
    logger.warn({ err }, 'session sqlite init failed — falling back to memory');
  }
}

export function getSession(sessionId: string): SessionData {
  if (!db) {
    return memoryGet(sessionId);
  }
  const row = db
    .prepare('SELECT profile_json, cart_json FROM shelvesense_sessions WHERE id = ?')
    .get(sessionId) as { profile_json: string | null; cart_json: string | null } | undefined;
  if (!row) {
    const fresh: SessionData = { profile: null, cart: emptyCart() };
    persistSqlite(sessionId, fresh);
    return fresh;
  }
  return rowToSession(row.profile_json, row.cart_json);
}

export function setSessionProfile(sessionId: string, profile: HealthProfile): void {
  const s = getSession(sessionId);
  s.profile = profile;
  if (!db) {
    memory.set(sessionId, s);
    return;
  }
  persistSqlite(sessionId, s);
}

export function setSessionCart(sessionId: string, cart: CartState): void {
  const s = getSession(sessionId);
  s.cart = cart;
  if (!db) {
    memory.set(sessionId, s);
    return;
  }
  persistSqlite(sessionId, s);
}

/** Attach hydrated session to Express `req` (reads DB when using SQLite). */
export function loadSessionIntoRequest(sessionId: string): SessionData {
  return getSession(sessionId);
}
