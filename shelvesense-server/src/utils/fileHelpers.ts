import fs from 'fs';
import path from 'path';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

const SAFE = /^[a-zA-Z0-9._-]+$/;

export function sanitizeFilename(name: string, fallback = 'file'): string {
  const base = path.basename(name).replace(/\s+/g, '_');
  if (SAFE.test(base) && base.length > 0 && base.length < 200) return base;
  return fallback;
}

export function writeBufferUnique(dir: string, prefix: string, ext: string, buf: Buffer): string {
  ensureDir(dir);
  const name = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext.replace(/^\./, '')}`;
  const full = path.join(dir, sanitizeFilename(name, `${prefix}.bin`));
  fs.writeFileSync(full, buf);
  return full;
}
