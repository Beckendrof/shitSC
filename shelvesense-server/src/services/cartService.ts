import type { CartLineItem, CartState, CartUpdateInput, CartUpdateResult, Verdict } from '../types.js';

export function emptyCart(): CartState {
  return {
    items: [],
    verdictCounts: { Safe: 0, Caution: 0, Avoid: 0 },
    allergenRisk: 'low',
    sugarBurden: 'low',
    sodiumBurden: 'low',
    trendSummary: 'No items yet — start scanning.',
  };
}

function scoreFlags(flags: string[], needles: string[]): number {
  const f = flags.join(' ').toLowerCase();
  return needles.reduce((acc, n) => (f.includes(n) ? acc + 1 : acc), 0);
}

function inferBurden(flags: string[], risks: string[], kind: 'sugar' | 'sodium' | 'allergen'): 'low' | 'medium' | 'high' {
  const blob = `${flags.join(' ')} ${risks.join(' ')}`.toLowerCase();
  if (kind === 'allergen') {
    if (/(allergen|peanut|tree nut|milk|egg|wheat|soy|fish|shellfish|sesame)/.test(blob)) return 'high';
    if (/may contain/.test(blob)) return 'medium';
    return 'low';
  }
  if (kind === 'sugar') {
    const hits = scoreFlags(flags, ['sugar', 'syrup', 'fructose', 'sweetener', 'juice concentrate']) + (/\bsugar\b/.test(blob) ? 1 : 0);
    if (hits >= 3) return 'high';
    if (hits >= 1) return 'medium';
    return 'low';
  }
  const hits = scoreFlags(flags, ['sodium', 'salt', 'msg', 'nitrite', 'brine']) + (/\bsodium\b/.test(blob) ? 1 : 0);
  if (hits >= 3) return 'high';
  if (hits >= 1) return 'medium';
  return 'low';
}

function verdictCountsFromItems(items: CartLineItem[]) {
  const counts = { Safe: 0, Caution: 0, Avoid: 0 } satisfies Record<Verdict, number>;
  for (const it of items) counts[it.verdict] += 1;
  return counts;
}

function buildTrendSummary(items: CartLineItem[], counts: Record<Verdict, number>): string {
  if (items.length === 0) return 'No items yet — start scanning.';
  const last = items[items.length - 1];
  return `${items.length} items — last: ${last.verdict} (${counts.Avoid} avoid, ${counts.Caution} caution).`;
}

export function updateCartState(input: CartUpdateInput): CartUpdateResult {
  const base = input.cart ?? emptyCart();
  const item: CartLineItem = {
    productName: input.latestItem.productName,
    verdict: input.latestItem.verdict,
    ingredients_flags: input.latestItem.ingredients_flags,
    capturedAt: new Date().toISOString(),
  };
  const items = [...base.items, item].slice(-40);

  const verdictCounts = verdictCountsFromItems(items);
  const allergenRisk = inferBurden(
    items.flatMap((i) => i.ingredients_flags),
    input.latestItem.health_risks,
    'allergen',
  );
  const sugarBurden = inferBurden(
    items.flatMap((i) => i.ingredients_flags),
    input.latestItem.health_risks,
    'sugar',
  );
  const sodiumBurden = inferBurden(
    items.flatMap((i) => i.ingredients_flags),
    input.latestItem.health_risks,
    'sodium',
  );

  const cart: CartState = {
    items,
    verdictCounts,
    allergenRisk,
    sugarBurden,
    sodiumBurden,
    trendSummary: buildTrendSummary(items, verdictCounts),
  };

  const riskAlerts: string[] = [];
  if (allergenRisk === 'high') riskAlerts.push('Possible allergen pattern in recent scans.');
  if (sugarBurden === 'high') riskAlerts.push('Added sugar load trending high.');
  if (sodiumBurden === 'high') riskAlerts.push('Sodium load trending high.');
  if (verdictCounts.Avoid >= 2) riskAlerts.push('Multiple “Avoid” picks — consider resetting staples.');

  const healthTrendSummary = [
    `Verdict mix: ${verdictCounts.Safe} safe / ${verdictCounts.Caution} caution / ${verdictCounts.Avoid} avoid.`,
    `Risks — allergen: ${allergenRisk}, sugar: ${sugarBurden}, sodium: ${sodiumBurden}.`,
  ].join(' ');

  return { cart, healthTrendSummary, riskAlerts };
}
