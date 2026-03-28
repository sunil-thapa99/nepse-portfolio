import Papa from "papaparse";
import { classifyTransaction } from "./classifyTransaction";
import type { ParsedTransaction, RawMeroshareRow } from "./types";

function parseQty(s: string | undefined): number {
  if (s == null || s === "" || s === "-") return 0;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function rowHasTotal(values: Record<string, unknown>): boolean {
  return Object.values(values).some((v) =>
    String(v ?? "").toLowerCase().includes("total")
  );
}

function normalizeHeader(h: string): string {
  return h.trim();
}

export function parseMeroshareCsv(text: string): ParsedTransaction[] {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error(parsed.errors.map((e) => e.message).join("; "));
  }

  const out: ParsedTransaction[] = [];

  for (const row of parsed.data) {
    if (rowHasTotal(row as Record<string, unknown>)) continue;

    const snRaw = row["S.N"] ?? row["S.N."] ?? "";
    const sn = Number(String(snRaw).trim());
    if (!Number.isFinite(sn)) continue;

    const desc = row["History Description"] ?? "";
    const scrip = (row["Scrip"] ?? "").trim();
    if (!scrip) continue;

    const date = (row["Transaction Date"] ?? "").trim();
    const credit = parseQty(row["Credit Quantity"]);
    const debit = parseQty(row["Debit Quantity"]);
    const balanceAfter = parseQty(row["Balance After Transaction"]);

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

/** @internal for tests */
export function _parseQty(s: string | undefined): number {
  return parseQty(s);
}

export type { RawMeroshareRow };
