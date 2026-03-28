import { describe, expect, it } from "vitest";
import { isBonusPurchaseSource, parsePurchaseCsv } from "./parsePurchaseCsv";

describe("parsePurchaseCsv", () => {
  it("parses normalized purchase export", () => {
    const csv = `scraped_at,Scrip,Transaction Date,Quantity,Rate,Purchase Source
2026-01-01T00:00:00,ADBL,2025-05-14,23,285.1482,ON_MARKET
`;
    const rows = parsePurchaseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].scrip).toBe("ADBL");
    expect(rows[0].quantity).toBe(23);
    expect(rows[0].rate).toBe(285.1482);
    expect(rows[0].isBonus).toBe(false);
  });

  it("marks bonus lots", () => {
    const csv = `scraped_at,Scrip,Transaction Date,Quantity,Rate,Purchase Source
x,X,2024-01-01,1,100,BONUS
`;
    const rows = parsePurchaseCsv(csv);
    expect(rows[0].isBonus).toBe(true);
  });
});

describe("isBonusPurchaseSource", () => {
  it("normalizes hyphens", () => {
    expect(isBonusPurchaseSource("BONUS")).toBe(true);
    expect(isBonusPurchaseSource("ON-MARKET")).toBe(false);
  });
});
