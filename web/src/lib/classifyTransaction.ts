import type { TxCategory } from "./types";

export function classifyTransaction(description: string): TxCategory {
  const d = description.toUpperCase();
  if (d.includes("ON-DR")) return "Sell";
  if (d.includes("ON-CR")) return "Secondary buy";
  if (
    d.includes("INITIAL PUBLIC OFFERING") ||
    d.includes("IPO-") ||
    d.includes("SBCFIPO")
  ) {
    return "IPO";
  }
  if (d.includes("CA-BONUS")) return "Bonus";
  if (d.includes("CA-RIGHTS")) return "Rights";
  if (d.includes("CA-REARRANGEMENT")) return "Rearrangement";
  return "Other";
}
