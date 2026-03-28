export type TxCategory =
  | "Secondary buy"
  | "Sell"
  | "IPO"
  | "Bonus"
  | "Rights"
  | "Rearrangement"
  | "Other";

export interface RawMeroshareRow {
  scraped_at?: string;
  "S.N": string;
  Scrip: string;
  "Transaction Date": string;
  "Credit Quantity": string;
  "Debit Quantity": string;
  "Balance After Transaction": string;
  "History Description": string;
}

export interface ParsedTransaction {
  sn: number;
  scrip: string;
  date: string;
  credit: number;
  debit: number;
  balanceAfter: number;
  description: string;
  category: TxCategory;
}

export interface ParsedPurchaseLine {
  scrip: string;
  transactionDate: string;
  quantity: number;
  rate: number;
  purchaseSource: string;
  isBonus: boolean;
}

export interface ScripAggregate {
  scrip: string;
  currentUnits: number;
  lifetimeSoldUnits: number;
  lifetimeCreditedUnits: number;
  maxHistoricalBalance: number;
  lastActivityDate: string | null;
  lastSellDate: string | null;
  creditsByCategory: Record<TxCategory, number>;
  /** FIFO weighted average cost (NPR) when purchase CSV is loaded. */
  waccNPR: number | null;
  /** NPR cost basis for remaining units when purchase CSV is loaded. */
  totalInvestedNPR: number | null;
  realizedPnLNPR: null;
  unrealizedPnLNPR: null;
}

export interface PortfolioResult {
  transactions: ParsedTransaction[];
  byScrip: Map<string, ScripAggregate>;
  orderedScrips: string[];
}
