import type { Verdict } from '../types';

/** RGBA for high-contrast AR overlays (0–1). */
export function verdictColor(verdict: Verdict): vec4 {
  switch (verdict) {
    case 'Safe':
      return new vec4(0.15, 0.85, 0.35, 1);
    case 'Caution':
      return new vec4(0.95, 0.82, 0.12, 1);
    case 'Avoid':
      return new vec4(0.95, 0.2, 0.2, 1);
    default:
      return new vec4(1, 1, 1, 1);
  }
}
