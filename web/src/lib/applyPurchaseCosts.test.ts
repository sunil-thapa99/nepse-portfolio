import { describe, expect, it } from "vitest";
import { fifoCostForOpenPosition } from "./applyPurchaseCosts";
import type { ParsedPurchaseLine, ParsedTransaction } from "./types";

function tx(
  sn: number,
  credit: number,
  debit: number
): ParsedTransaction {
  return {
    sn,
    scrip: "ABC",
    date: "2024-01-01",
    credit,
    debit,
    balanceAfter: 0,
    description: "",
    category: "Secondary buy",
  };
}

describe("fifoCostForOpenPosition", () => {
  it("computes WACC for remaining units after a sell", () => {
    const lines: ParsedPurchaseLine[] = [
      {
        scrip: "ABC",
        transactionDate: "2024-01-01",
        quantity: 10,
        rate: 100,
        purchaseSource: "ON_MARKET",
        isBonus: false,
      },
    ];
    const txs: ParsedTransaction[] = [
      tx(2, 0, 3),
      tx(3, 10, 0),
    ];
    const { waccNPR, totalInvestedNPR } = fifoCostForOpenPosition(
      txs,
      lines,
      7
    );
    expect(waccNPR).toBe(100);
    expect(totalInvestedNPR).toBe(700);
  });

  it("zero cost for bonus lots", () => {
    const lines: ParsedPurchaseLine[] = [
      {
        scrip: "ABC",
        transactionDate: "2024-01-01",
        quantity: 10,
        rate: 100,
        purchaseSource: "BONUS",
        isBonus: true,
      },
    ];
    const txs: ParsedTransaction[] = [tx(1, 10, 0)];
    const { waccNPR, totalInvestedNPR } = fifoCostForOpenPosition(
      txs,
      lines,
      10
    );
    expect(waccNPR).toBe(0);
    expect(totalInvestedNPR).toBe(0);
  });
});
