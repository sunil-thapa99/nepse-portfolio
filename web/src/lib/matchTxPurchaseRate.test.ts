import { describe, expect, it } from "vitest";
import { ratesForTransactions } from "./matchTxPurchaseRate";
import type { ParsedPurchaseLine, ParsedTransaction } from "./types";

function tx(
  sn: number,
  credit: number,
  debit: number,
  date: string,
  scrip = "ABC"
): ParsedTransaction {
  return {
    sn,
    scrip,
    date,
    credit,
    debit,
    balanceAfter: 0,
    description: "",
    category: "Secondary buy",
  };
}

describe("ratesForTransactions", () => {
  it("matches credit rows to purchase lines by date and qty", () => {
    const lines: ParsedPurchaseLine[] = [
      {
        scrip: "ABC",
        transactionDate: "2024-06-01",
        quantity: 10,
        rate: 250.5,
        purchaseSource: "ON_MARKET",
        isBonus: false,
      },
    ];
    const txs: ParsedTransaction[] = [tx(1, 10, 0, "2024-06-01")];
    expect(ratesForTransactions("ABC", txs, lines)).toEqual([250.5]);
  });

  it("returns null for sells and unmatched credits", () => {
    const lines: ParsedPurchaseLine[] = [];
    const txs: ParsedTransaction[] = [
      tx(1, 0, 5, "2024-06-02"),
      tx(2, 3, 0, "2024-06-01"),
    ];
    expect(ratesForTransactions("ABC", txs, lines)).toEqual([null, null]);
  });

  it("matches when purchase date is one day before tx (settlement)", () => {
    const lines: ParsedPurchaseLine[] = [
      {
        scrip: "BFC",
        transactionDate: "2026-02-25",
        quantity: 30,
        rate: 462.5583,
        purchaseSource: "ON_MARKET",
        isBonus: false,
      },
    ];
    const txs: ParsedTransaction[] = [
      tx(1, 30, 0, "2026-02-26", "BFC"),
    ];
    expect(ratesForTransactions("BFC", txs, lines)).toEqual([462.5583]);
  });

  it("picks closest of two qty matches by calendar distance", () => {
    const lines: ParsedPurchaseLine[] = [
      {
        scrip: "ABC",
        transactionDate: "2025-07-31",
        quantity: 30,
        rate: 100,
        purchaseSource: "ON_MARKET",
        isBonus: false,
      },
      {
        scrip: "ABC",
        transactionDate: "2026-02-25",
        quantity: 30,
        rate: 200,
        purchaseSource: "ON_MARKET",
        isBonus: false,
      },
    ];
    const txs: ParsedTransaction[] = [tx(1, 30, 0, "2026-02-26")];
    expect(ratesForTransactions("ABC", txs, lines)).toEqual([200]);
  });
});
