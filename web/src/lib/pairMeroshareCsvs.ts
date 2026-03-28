/** Filename only (handles webkitRelativePath segments). */
export function fileBasename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file, "UTF-8");
  });
}

function looksLikeTransactionsCsv(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes("s.n") && head.includes("credit quantity");
}

function looksLikePurchaseCsv(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return (
    head.includes("purchase source") &&
    head.includes("quantity") &&
    !head.includes("history description")
  );
}

export interface PairedMeroshareCsvs {
  transactionsText: string;
  purchaseText: string | null;
  /** User-facing hint when purchase missing. */
  hint: string | null;
}

/**
 * Pair already-read file contents (testable without FileReader).
 */
export function pairMeroshareFromLoaded(
  loaded: { base: string; text: string }[]
): PairedMeroshareCsvs {
  const purchaseByPrefix = new Map<string, string>();
  for (const { base, text } of loaded) {
    const m = base.match(/^(.+)_purchase_sources\.csv$/i);
    if (m) purchaseByPrefix.set(m[1].toLowerCase(), text);
  }

  let transactionsText = "";
  let matchedPrefix: string | null = null;

  for (const { base, text } of loaded) {
    const m = base.match(/^(.+)_transactions\.csv$/i);
    if (!m) continue;
    transactionsText = text;
    matchedPrefix = m[1].toLowerCase();
    break;
  }

  if (!transactionsText) {
    const guess = loaded.find((x) => looksLikeTransactionsCsv(x.text));
    if (guess) transactionsText = guess.text;
  }

  if (!transactionsText) {
    throw new Error(
      "Could not find My Transaction History CSV (expected columns like S.N, Credit Quantity)."
    );
  }

  let purchaseText: string | null = null;
  if (matchedPrefix) {
    purchaseText = purchaseByPrefix.get(matchedPrefix) ?? null;
  }
  if (!purchaseText) {
    const guess = loaded.find((x) => looksLikePurchaseCsv(x.text));
    if (guess) purchaseText = guess.text;
  }

  let hint: string | null = null;
  if (!purchaseText) {
    hint =
      "Purchase source CSV not found. Select both `*_transactions.csv` and `*_purchase_sources.csv` in the same dialog (Ctrl/Cmd+click). WACC and cost basis stay hidden until purchase data is loaded.";
  }

  return { transactionsText, purchaseText, hint };
}

/**
 * From a multi-select or folder FileList, locate My Transaction History + My Purchase Source
 * by `*_transactions.csv` / `*_purchase_sources.csv` naming (same prefix).
 */
export async function pairMeroshareCsvsFromFiles(
  files: FileList | File[]
): Promise<PairedMeroshareCsvs> {
  const list = [...files].filter((f) => /\.csv$/i.test(f.name));
  if (list.length === 0) {
    throw new Error("No CSV files selected.");
  }

  const loaded = await Promise.all(
    list.map(async (file) => ({
      base: fileBasename(file.webkitRelativePath || file.name),
      text: await readFileText(file),
    }))
  );

  return pairMeroshareFromLoaded(loaded);
}
