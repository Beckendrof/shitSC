import { verdictColor } from '../utils/colors';
import type { CartState, LabelAnalysis, Verdict } from '../types';

function joinBullets(items: string[], max: number): string {
  return items
    .filter(Boolean)
    .slice(0, max)
    .map((s) => `• ${s}`)
    .join('\n');
}

export function renderVerdictTexts(
  analysis: LabelAnalysis,
  headline: Text | null,
  details: Text | null,
  alternatives: Text | null,
  cartSummary: Text | null,
): void {
  if (headline) {
    headline.text = `${analysis.verdict}`;
    headline.textFill.mode = TextFillMode.Solid;
    headline.textFill.color = verdictColor(analysis.verdict as Verdict);
  }
  if (details) {
    details.text = analysis.reason;
  }
  if (alternatives) {
    const lines = analysis.better_alternatives.slice(0, 3).map((a) => `${a.name} — ${a.why_better}`);
    const flags = joinBullets(analysis.ingredients_flags, 3);
    const risks = joinBullets(analysis.health_risks, 3);
    const extra = [flags && `Flags:\n${flags}`, risks && `Risks:\n${risks}`].filter(Boolean).join('\n\n');
    const base = lines.length ? lines.join('\n') : 'No alternatives returned.';
    alternatives.text = extra ? `${base}\n\n${extra}` : base;
  }
  if (cartSummary) {
    cartSummary.text = `${analysis.cart_impact.summary}\nScore: ${analysis.cart_impact.running_score}`;
  }
}

export function renderCartPanel(cart: CartState | null, cartSummary: Text | null): void {
  if (!cartSummary || !cart) {
    return;
  }
  cartSummary.text = `${cart.trendSummary}\n(S ${cart.verdictCounts.Safe} / C ${cart.verdictCounts.Caution} / A ${cart.verdictCounts.Avoid})`;
}

export function showError(details: Text | null, message: string): void {
  if (details) {
    details.text = message;
  }
}

export function clearTexts(
  headline: Text | null,
  details: Text | null,
  alternatives: Text | null,
  cartSummary: Text | null,
): void {
  if (headline) headline.text = '';
  if (details) details.text = '';
  if (alternatives) alternatives.text = '';
  if (cartSummary) cartSummary.text = '';
}
