import type { ParsedPurchaseLine, ParsedTransaction } from "./types";

type LinePool = ParsedPurchaseLine & { consumed?: boolean };

function qtyMatch(lineQty: number, credit: number): boolean {
  return Math.abs(lineQty - credit) < 1e-6;
}

/** Calendar days apart; invalid/empty purchase date → large gap (fallback last). */
function dayDistance(txDate: string, purDate: string): number {
  const p = purDate.trim();
  if (!p) return 100_000;
  const a = Date.parse(`${txDate.trim()}T12:00:00`);
  const b = Date.parse(`${p}T12:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 100_000;
  return Math.abs(Math.round((a - b) / 86400000));
}

/**
 * For each credit transaction, assign a rate from an unused purchase line with the same quantity.
 * Prefer exact date match; otherwise closest purchase Transaction Date (handles T+1 settlement vs MeroShare tx date).
 * Sells get null. Credits with no purchase line (e.g. IPO-only) stay null.
 */
export function ratesForTransactions(
  scrip: string,
  txsOldestFirst: ParsedTransaction[],
  lines: ParsedPurchaseLine[]
): (number | null)[] {
  const pool: LinePool[] = lines
    .filter((l) => l.scrip === scrip)
    .map((l) => ({ ...l }));

  const out: (number | null)[] = [];

  for (const tx of txsOldestFirst) {
    if (tx.credit <= 0) {
      out.push(null);
      continue;
    }

    const candidates = pool.filter(
      (l) => !l.consumed && qtyMatch(l.quantity, tx.credit)
    );
    if (candidates.length === 0) {
      out.push(null);
      continue;
    }

    let best = candidates[0];
    let bestDist = dayDistance(tx.date, best.transactionDate);
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const d = dayDistance(tx.date, c.transactionDate);
      if (d < bestDist) {
        best = c;
        bestDist = d;
      } else if (d === bestDist) {
        const bd = (best.transactionDate || "\uFFFF").localeCompare(
          c.transactionDate || "\uFFFF"
        );
        if (bd > 0) best = c;
      }
    }

    best.consumed = true;
    out.push(best.rate);
  }

  return out;
}
