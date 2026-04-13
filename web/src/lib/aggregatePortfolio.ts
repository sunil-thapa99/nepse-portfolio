import type { ParsedTransaction, PortfolioResult, ScripAggregate, TxCategory } from "./types";

const emptyCredits = (): Record<TxCategory, number> => ({
  "Secondary buy": 0,
  Sell: 0,
  IPO: 0,
  Bonus: 0,
  Rights: 0,
  Rearrangement: 0,
  Other: 0,
});

function emptyAggregate(scrip: string): ScripAggregate {
  return {
    scrip,
    currentUnits: 0,
    lifetimeSoldUnits: 0,
    lifetimeCreditedUnits: 0,
    maxHistoricalBalance: 0,
    lastActivityDate: null,
    lastSellDate: null,
    creditsByCategory: emptyCredits(),
    waccNPR: null,
    totalInvestedNPR: null,
    ltpNPR: null,
    realizedPnLNPR: null,
    unrealizedPnLNPR: null,
  };
}

function maxDate(a: string | null, b: string): string | null {
  if (!a) return b;
  return b > a ? b : a;
}

/**
 * MeroShare CSV lists newest first; S.N decreases toward newer rows.
 * Chronological processing: sort by S.N descending (oldest first).
 */
export function aggregatePortfolio(
  transactions: ParsedTransaction[]
): PortfolioResult {
  const chrono = [...transactions].sort((a, b) => b.sn - a.sn);

  const byScrip = new Map<string, ScripAggregate>();
  const scripOrder: string[] = [];

  for (const tx of chrono) {
    if (!byScrip.has(tx.scrip)) {
      byScrip.set(tx.scrip, emptyAggregate(tx.scrip));
      scripOrder.push(tx.scrip);
    }
  }

  for (const scrip of scripOrder) {
    const agg = byScrip.get(scrip)!;
    const rows = chrono.filter((t) => t.scrip === scrip);
    let running = 0;

    for (const tx of rows) {
      agg.lastActivityDate = maxDate(agg.lastActivityDate, tx.date);
      agg.lifetimeSoldUnits += tx.debit;
      agg.lifetimeCreditedUnits += tx.credit;

      if (tx.credit > 0) {
        agg.creditsByCategory[tx.category] += tx.credit;
      }

      running += tx.credit - tx.debit;
      if (running > agg.maxHistoricalBalance) {
        agg.maxHistoricalBalance = running;
      }

      if (tx.debit > 0) {
        agg.lastSellDate = maxDate(agg.lastSellDate, tx.date);
      }

      agg.currentUnits = running;
    }

    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow.balanceAfter - agg.currentUnits) > 0.01) {
      if (import.meta.env.DEV) {
        console.warn(
          `[portfolio] Balance mismatch for ${scrip}: computed ${agg.currentUnits}, CSV balance ${lastRow.balanceAfter}`
        );
      }
      agg.currentUnits = lastRow.balanceAfter;
    }
  }

  const orderedScrips = [...scripOrder].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  return {
    transactions: chrono,
    byScrip,
    orderedScrips,
  };
}

export function portfolioTotalSoldUnits(transactions: ParsedTransaction[]): number {
  return transactions.reduce((s, t) => s + t.debit, 0);
}
