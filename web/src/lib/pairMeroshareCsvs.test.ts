import { describe, expect, it } from "vitest";
import { pairMeroshareFromLoaded } from "./pairMeroshareCsvs";

const TX_HEADER = `scraped_at,S.N,Scrip,Transaction Date,Credit Quantity,Debit Quantity,Balance After Transaction,History Description`;
const TX_ROW = `2026-01-01,1,TEST,2024-01-01,10,0,10,x`;
const PUR_HEADER = `scraped_at,Scrip,Transaction Date,Quantity,Rate,Purchase Source`;
const PUR_ROW = `2026-01-01,TEST,2024-01-01,10,100,ON_MARKET`;

describe("pairMeroshareFromLoaded", () => {
  it("pairs by filename prefix", () => {
    const r = pairMeroshareFromLoaded([
      {
        base: "user123_transactions.csv",
        text: `${TX_HEADER}\n${TX_ROW}`,
      },
      {
        base: "user123_purchase_sources.csv",
        text: `${PUR_HEADER}\n${PUR_ROW}`,
      },
    ]);
    expect(r.transactionsText).toContain("Credit Quantity");
    expect(r.purchaseText).toContain("Purchase Source");
    expect(r.hint).toBeNull();
  });
});
