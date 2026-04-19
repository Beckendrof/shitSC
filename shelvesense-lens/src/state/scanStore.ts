import type { CartState, HealthProfile, ShelfSenseErrorInfo, ShelfSenseUiState, LabelAnalysis } from '../types';

export class ScanStore {
  uiState: ShelfSenseUiState = 'IDLE';

  sessionId: string | null = null;

  profile: HealthProfile | null = null;

  cart: CartState | null = null;

  lastAnalysis: LabelAnalysis | null = null;

  lastError: ShelfSenseErrorInfo | null = null;

  /** Fingerprint of last encoded frame to suppress duplicate submits. */
  lastImageFingerprint: string | null = null;

  setState(next: ShelfSenseUiState): void {
    this.uiState = next;
  }

  applySessionHeader(header?: string): void {
    if (header && header.length > 0) {
      this.sessionId = header;
    }
  }

  resetResult(): void {
    this.lastAnalysis = null;
    this.lastError = null;
  }
}
