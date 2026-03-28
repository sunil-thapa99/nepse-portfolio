import type { ParsedPurchaseLine, ParsedTransaction, ScripAggregate } from "./types";

export interface CostBasisResult {
  waccNPR: number | null;
  totalInvestedNPR: number | null;
}

function purchaseLineSortKey(line: ParsedPurchaseLine): string {
  const d = line.transactionDate.trim();
  if (!d) return "\uFFFF";
  return d;
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

  type Lot = { remaining: number; unitCost: number };
  const lots: Lot[] = sorted.map((l) => ({
    remaining: l.quantity,
    unitCost: l.isBonus ? 0 : l.rate,
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
