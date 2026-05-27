import type { ParsedPurchaseLine, ParsedTransaction, ScripAggregate } from "./types";
import { isZeroCostPurchaseSource } from "./parsePurchaseCsv";

export interface CostBasisResult {
  waccNPR: number | null;
  totalInvestedNPR: number | null;
}

function purchaseLineSortKey(line: ParsedPurchaseLine): string {
  const d = line.transactionDate.trim();
  if (!d) return "\uFFFF";
  return d;
}

function qtyMatch(lineQty: number, credit: number): boolean {
  return Math.abs(lineQty - credit) < 1e-6;
}

function dayDistance(txDate: string, purchaseDate: string): number {
  const p = purchaseDate.trim();
  if (!p) return 100_000;
  const a = Date.parse(`${txDate.trim()}T12:00:00`);
  const b = Date.parse(`${p}T12:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 100_000;
  return Math.abs(Math.round((a - b) / 86400000));
}

function isDrepTransaction(tx: ParsedTransaction): boolean {
  return tx.credit > 0 && tx.description.toUpperCase().includes("DREP");
}

function drepLineIndexes(
  txsOldestFirst: ParsedTransaction[],
  linesSorted: ParsedPurchaseLine[]
): Set<number> {
  const drepTxs = txsOldestFirst.filter(isDrepTransaction);
  const matched = new Set<number>();

  for (const tx of drepTxs) {
    const candidates = linesSorted
      .map((line, idx) => ({ line, idx }))
      .filter(({ line, idx }) => !matched.has(idx) && qtyMatch(line.quantity, tx.credit));

    if (candidates.length === 0) continue;

    let best = candidates[0];
    let bestDist = dayDistance(tx.date, best.line.transactionDate);
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const dist = dayDistance(tx.date, c.line.transactionDate);
      if (
        dist < bestDist ||
        (dist === bestDist &&
          purchaseLineSortKey(c.line).localeCompare(purchaseLineSortKey(best.line)) < 0)
      ) {
        best = c;
        bestDist = dist;
      }
    }

    matched.add(best.idx);
  }

  return matched;
}

export function fifoCostForOpenPosition(
  txsOldestFirst: ParsedTransaction[],
  linesForScrip: ParsedPurchaseLine[],
  currentUnits: number
): CostBasisResult {
  if (currentUnits <= 0 || linesForScrip.length === 0) {
    return { waccNPR: null, totalInvestedNPR: null };
  }

  const sorted = [...linesForScrip].sort((a, b) =>
    purchaseLineSortKey(a).localeCompare(purchaseLineSortKey(b))
  );
  const drepIndexes = drepLineIndexes(txsOldestFirst, sorted);

  type Lot = { remaining: number; unitCost: number };
  const lots: Lot[] = sorted.map((line, idx) => ({
    remaining: line.quantity,
    unitCost:
      line.isBonus || isZeroCostPurchaseSource(line.purchaseSource) || drepIndexes.has(idx)
        ? 0
        : line.rate,
  }));

  for (const tx of txsOldestFirst) {
    if (tx.debit <= 0) continue;
    let sell = tx.debit;
    while (sell > 1e-9 && lots.length > 0) {
      const head = lots[0];
      const take = Math.min(head.remaining, sell);
      head.remaining -= take;
      sell -= take;
      if (head.remaining <= 1e-9) lots.shift();
    }
  }

  let totalCost = 0;
  let totalQty = 0;
  for (const lot of lots) {
    if (lot.remaining <= 1e-9) continue;
    totalQty += lot.remaining;
    totalCost += lot.remaining * lot.unitCost;
  }

  if (totalQty <= 1e-9) {
    return { waccNPR: null, totalInvestedNPR: null };
  }

  if (Math.abs(totalQty - currentUnits) > 0.02) {
    if (totalQty > currentUnits + 1e-9) {
      const scale = currentUnits / totalQty;
      totalCost *= scale;
      totalQty = currentUnits;
    } else {
      return { waccNPR: null, totalInvestedNPR: null };
    }
  }

  const wacc = totalCost / totalQty;
  return {
    waccNPR: Number.isFinite(wacc) ? wacc : null,
    totalInvestedNPR: Number.isFinite(totalCost) ? totalCost : null,
  };
}

export function applyPurchaseCostsToAggregates(
  byScrip: Map<string, ScripAggregate>,
  transactionsChrono: ParsedTransaction[],
  purchaseLines: ParsedPurchaseLine[]
): void {
  const byS = new Map<string, ParsedPurchaseLine[]>();
  for (const line of purchaseLines) {
    const k = line.scrip;
    if (!byS.has(k)) byS.set(k, []);
    byS.get(k)!.push(line);
  }

  for (const [, agg] of byScrip) {
    const scrip = agg.scrip;
    const txs = transactionsChrono.filter((t) => t.scrip === scrip);
    const lines = byS.get(scrip) ?? [];
    const { waccNPR, totalInvestedNPR } = fifoCostForOpenPosition(
      txs,
      lines,
      agg.currentUnits
    );
    agg.waccNPR = waccNPR;
    agg.totalInvestedNPR = totalInvestedNPR;
  }
}
