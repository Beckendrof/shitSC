export class CooldownGate {
  private lastFireMs = 0;

  constructor(private readonly minIntervalMs: number) {}

  tryEnter(nowMs: number): boolean {
    if (nowMs - this.lastFireMs < this.minIntervalMs) {
      return false;
    }
    this.lastFireMs = nowMs;
    return true;
  }

  reset(): void {
    this.lastFireMs = 0;
  }
}
