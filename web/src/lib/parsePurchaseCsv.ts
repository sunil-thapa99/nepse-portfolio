import Papa from "papaparse";
import type { ParsedPurchaseLine } from "./types";

function normalizeHeader(h: string): string {
  return h.trim();
}

function parseQty(s: string | undefined): number {
  if (s == null || s === "") return NaN;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function parseRate(s: string | undefined): number {
  if (s == null || s === "") return NaN;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

/** MeroShare / scraper uses BONUS, ON_MARKET, etc. */
export function isBonusPurchaseSource(raw: string): boolean {
  return raw.trim().toUpperCase().replace(/-/g, "_") === "BONUS";
}

export function parsePurchaseCsv(text: string): ParsedPurchaseLine[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors.map((e) => e.message).join("; "));
  }

  const out: ParsedPurchaseLine[] = [];

  for (const row of parsed.data) {
    const scrip = (row["Scrip"] ?? "").trim();
    if (!scrip) continue;

    const qty = parseQty(row["Quantity"]);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const rate = parseRate(row["Rate"]);
    const date = (row["Transaction Date"] ?? "").trim();
    const srcRaw = (row["Purchase Source"] ?? "").trim();

    out.push({
      scrip,
      transactionDate: date,
      quantity: qty,
      rate: Number.isFinite(rate) ? rate : 0,
      purchaseSource: srcRaw,
      isBonus: isBonusPurchaseSource(srcRaw),
    });
  }

  return out;
}
