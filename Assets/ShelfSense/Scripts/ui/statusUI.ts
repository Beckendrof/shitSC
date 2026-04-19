import type { ShelfSenseUiState } from '../types';

export function applyStatusRing(
  ring: SceneObject | null,
  state: ShelfSenseUiState,
): void {
  if (!ring) {
    return;
  }
  const active = state === 'SCANNING' || state === 'ANALYZING';
  ring.enabled = active;
}

export function applyLoadingIndicator(
  indicator: SceneObject | null,
  state: ShelfSenseUiState,
): void {
  if (!indicator) {
    return;
  }
  indicator.enabled = state === 'SCANNING' || state === 'ANALYZING';
}
