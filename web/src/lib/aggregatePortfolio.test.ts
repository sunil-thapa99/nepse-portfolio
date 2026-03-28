import { describe, expect, it } from "vitest";
import { aggregatePortfolio } from "./aggregatePortfolio";
import type { ParsedTransaction } from "./types";

/** Higher S.N = older row (MeroShare export: S.N 1 is newest). */
function tx(
  sn: number,
  scrip: string,
  date: string,
  credit: number,
  debit: number,
  balanceAfter: number,
  category: ParsedTransaction["category"]
): ParsedTransaction {
  return {
    sn,
    scrip,
    date,
    credit,
    debit,
    balanceAfter,
    description: "",
    category,
  };
}

describe("aggregatePortfolio", () => {
  it("processes oldest-first by S.N descending and computes balances", () => {
    const rows: ParsedTransaction[] = [
      tx(8, "ABC", "2024-01-03", 0, 5, 5, "Sell"),
      tx(10, "ABC", "2024-01-01", 10, 0, 10, "Secondary buy"),
    ];
    const { byScrip } = aggregatePortfolio(rows);
    const a = byScrip.get("ABC")!;
    expect(a.currentUnits).toBe(5);
    expect(a.lifetimeSoldUnits).toBe(5);
    expect(a.lifetimeCreditedUnits).toBe(10);
    expect(a.maxHistoricalBalance).toBe(10);
    expect(a.creditsByCategory["Secondary buy"]).toBe(10);
  });

  it("marks fully exited scrips", () => {
    const rows: ParsedTransaction[] = [
      tx(18, "XYZ", "2024-02-02", 0, 10, 0, "Sell"),
      tx(20, "XYZ", "2024-02-01", 10, 0, 10, "IPO"),
    ];
    const { byScrip } = aggregatePortfolio(rows);
    const a = byScrip.get("XYZ")!;
    expect(a.currentUnits).toBe(0);
    expect(a.maxHistoricalBalance).toBe(10);
    expect(a.lastSellDate).toBe("2024-02-02");
  });

  it("tracks partial sells", () => {
    const rows: ParsedTransaction[] = [
      tx(5, "P", "2024-03-02", 0, 5, 5, "Sell"),
      tx(7, "P", "2024-03-01", 10, 0, 10, "Secondary buy"),
    ];
    const { byScrip } = aggregatePortfolio(rows);
    const a = byScrip.get("P")!;
    expect(a.currentUnits).toBe(5);
    expect(a.lifetimeSoldUnits).toBe(5);
  });
});
