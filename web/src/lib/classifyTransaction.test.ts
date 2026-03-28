import { describe, expect, it } from "vitest";
import { classifyTransaction } from "./classifyTransaction";

describe("classifyTransaction", () => {
  it("classifies sells and secondary buys", () => {
    expect(classifyTransaction("ON-DR TD:123 TX:456")).toBe("Sell");
    expect(classifyTransaction("ON-CR TD:123 TX:456")).toBe("Secondary buy");
  });

  it("classifies IPO variants", () => {
    expect(
      classifyTransaction("INITIAL PUBLIC OFFERING   00000494 RLEL-IPO- 082/83 CREDIT")
    ).toBe("IPO");
    expect(classifyTransaction("SBCFIPO - 077/78 CREDIT")).toBe("IPO");
    expect(classifyTransaction("IPO-SAIL-2082-83 CREDIT")).toBe("IPO");
  });

  it("classifies corporate actions", () => {
    expect(classifyTransaction("CA-Bonus 00010335 Cr Current Balance")).toBe("Bonus");
    expect(classifyTransaction("CA-Rights 00006455 R-100%- 2078 CREDIT")).toBe(
      "Rights"
    );
    expect(
      classifyTransaction("CA-Rearrangement 00006975 Pur Mar 11, 2026 CREDIT")
    ).toBe("Rearrangement");
  });

  it("falls back to Other", () => {
    expect(classifyTransaction("Something unknown")).toBe("Other");
  });
});
