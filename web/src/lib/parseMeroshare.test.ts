import { describe, expect, it } from "vitest";
import { parseMeroshareCsv } from "./parseMeroshare";

const SAMPLE = `scraped_at,S.N,Scrip,Transaction Date,Credit Quantity,Debit Quantity,Balance After Transaction,History Description
2026-01-01T00:00:00,2,TEST,2024-06-02,0,5,5,ON-DR TD:1 TX:2
2026-01-01T00:00:00,3,TEST,2024-06-01,10,0,10,ON-CR TD:1 TX:2
`;

describe("parseMeroshareCsv", () => {
  it("parses rows and classifies by description", () => {
    const rows = parseMeroshareCsv(SAMPLE);
    expect(rows).toHaveLength(2);
    const sorted = [...rows].sort((a, b) => b.sn - a.sn);
    expect(sorted[0].sn).toBe(3);
    expect(sorted[0].category).toBe("Secondary buy");
    expect(sorted[1].category).toBe("Sell");
  });
});
