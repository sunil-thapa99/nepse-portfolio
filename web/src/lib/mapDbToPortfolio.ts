/**
 * Map Supabase `transactions` / `purchase_sources` rows to portfolio pipeline types.
 * Synthetic `sn` matches CSV convention: older rows get larger `sn` so
 * `aggregatePortfolio`'s sort `(a,b) => b.sn - a.sn` processes chronologically.
 */

import { aggregatePortfolio } from "./aggregatePortfolio";
import { applyPurchaseCostsToAggregates } from "./applyPurchaseCosts";
import { classifyTransaction } from "./classifyTransaction";
import { isBonusPurchaseSource } from "./parsePurchaseCsv";
import type {
  ParsedPurchaseLine,
  ParsedTransaction,
  PortfolioResult,
} from "./types";

export type DbTransactionRow = {
  id: string;
  user_id: string;
  scrip: string;
  transaction_date: string;
  credit_quantity: number | string | null;
  debit_quantity: number | string | null;
  balance_after_transaction: number | string | null;
  history_description: string | null;
  scraped_at?: string;
  line_hash?: string;
  created_at?: string;
};

export type DbPurchaseSourceRow = {
  id: string;
  user_id: string;
  scrip: string;
  transaction_date: string;
  quantity: number | string;
  rate: number | string;
  purchase_source: string;
  scraped_at?: string;
  line_hash?: string;
  created_at?: string;
};

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (s === "" || s === "-") return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function dateStr(d: string): string {
  return d.length >= 10 ? d.slice(0, 10) : d;
}

export function dbTransactionsToParsed(
  rows: DbTransactionRow[]
): ParsedTransaction[] {
  const sorted = [...rows].sort((a, b) => {
    const da = dateStr(a.transaction_date);
    const db = dateStr(b.transaction_date);
    if (da !== db) return da.localeCompare(db);
    const sc = a.scrip.localeCompare(b.scrip, undefined, {
      sensitivity: "base",
    });
    if (sc !== 0) return sc;
    return a.id.localeCompare(b.id);
  });
  const n = sorted.length;
  const out: ParsedTransaction[] = [];
  for (let i = 0; i < n; i++) {
    const r = sorted[i]!;
    const sn = n - i;
    const desc = (r.history_description ?? "").trim();
    const scrip = (r.scrip ?? "").trim();
    if (!scrip) continue;
    const date = dateStr(r.transaction_date);
    const credit = num(r.credit_quantity);
    const debit = num(r.debit_quantity);
    const balanceAfter = num(r.balance_after_transaction);
    out.push({
      sn,
      scrip,
      date,
      credit,
      debit,
      balanceAfter,
      description: desc,
      category: classifyTransaction(desc),
    });
  }
  return out;
}

export function dbPurchaseSourcesToParsed(
  rows: DbPurchaseSourceRow[]
): ParsedPurchaseLine[] {
  const out: ParsedPurchaseLine[] = [];
  for (const r of rows) {
    const scrip = (r.scrip ?? "").trim();
    if (!scrip) continue;
    const qty = num(r.quantity);
    if (qty <= 0) continue;
    const rate = num(r.rate);
    const src = (r.purchase_source ?? "").trim();
    out.push({
      scrip,
      transactionDate: dateStr(r.transaction_date),
      quantity: qty,
      rate: Number.isFinite(rate) ? rate : 0,
      purchaseSource: src,
      isBonus: isBonusPurchaseSource(src),
    });
  }
  return out;
}

export function buildPortfolioFromDb(
  txRows: DbTransactionRow[],
  purchaseRows: DbPurchaseSourceRow[]
): PortfolioResult {
  const txs = dbTransactionsToParsed(txRows);
  const result = aggregatePortfolio(txs);
  if (purchaseRows.length > 0) {
    const lines = dbPurchaseSourcesToParsed(purchaseRows);
    applyPurchaseCostsToAggregates(result.byScrip, result.transactions, lines);
  }
  return result;
}
