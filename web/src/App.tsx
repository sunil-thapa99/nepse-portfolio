import { useCallback, useMemo, useState } from "react";
import {
  aggregatePortfolio,
  portfolioTotalSoldUnits,
} from "./lib/aggregatePortfolio";
import { applyPurchaseCostsToAggregates } from "./lib/applyPurchaseCosts";
import { pairMeroshareCsvsFromFiles } from "./lib/pairMeroshareCsvs";
import { parseMeroshareCsv } from "./lib/parseMeroshare";
import { parsePurchaseCsv } from "./lib/parsePurchaseCsv";
import type { PortfolioResult, ScripAggregate } from "./lib/types";
import { HoldingsTable } from "./components/HoldingsTable";
import { SoldSections } from "./components/SoldSections";
import { StockDetail } from "./components/StockDetail";
import { SummaryCards } from "./components/SummaryCards";

function matchesFilter(scrip: string, q: string): boolean {
  if (!q.trim()) return true;
  return scrip.toLowerCase().includes(q.trim().toLowerCase());
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function buildPortfolio(
  rawTxCsv: string,
  rawPurchaseCsv: string | null
): PortfolioResult {
  const txs = parseMeroshareCsv(rawTxCsv);
  const result = aggregatePortfolio(txs);
  if (rawPurchaseCsv) {
    const lines = parsePurchaseCsv(rawPurchaseCsv);
    applyPurchaseCostsToAggregates(result.byScrip, result.transactions, lines);
  }
  return result;
}

/** When portfolio is null, pinpoints which step failed (labeled for UI). */
function diagnosePortfolioFailure(
  rawTxCsv: string,
  rawPurchaseCsv: string | null
): string {
  let txs;
  try {
    txs = parseMeroshareCsv(rawTxCsv);
  } catch (e) {
    return `Transactions CSV: ${errMsg(e)}`;
  }
  let result;
  try {
    result = aggregatePortfolio(txs);
  } catch (e) {
    return `Portfolio: ${errMsg(e)}`;
  }
  if (rawPurchaseCsv) {
    let lines;
    try {
      lines = parsePurchaseCsv(rawPurchaseCsv);
    } catch (e) {
      return `Purchase source CSV: ${errMsg(e)}`;
    }
    try {
      applyPurchaseCostsToAggregates(result.byScrip, result.transactions, lines);
    } catch (e) {
      return `Portfolio: ${errMsg(e)}`;
    }
  }
  return "Could not build portfolio.";
}

export default function App() {
  const [rawTxCsv, setRawTxCsv] = useState<string | null>(null);
  const [rawPurchaseCsv, setRawPurchaseCsv] = useState<string | null>(null);
  const [loadHint, setLoadHint] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedScrip, setSelectedScrip] = useState<string | null>(null);

  const portfolio: PortfolioResult | null = useMemo(() => {
    if (!rawTxCsv) return null;
    try {
      return buildPortfolio(rawTxCsv, rawPurchaseCsv);
    } catch {
      return null;
    }
  }, [rawTxCsv, rawPurchaseCsv]);

  const loadError = useMemo(() => {
    if (!rawTxCsv) return null;
    if (portfolio) return null;
    return diagnosePortfolioFailure(rawTxCsv, rawPurchaseCsv);
  }, [rawTxCsv, rawPurchaseCsv, portfolio]);

  const displayError = parseError ?? loadError;

  const aggregates = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.orderedScrips
      .map((s) => portfolio.byScrip.get(s)!)
      .filter((a) => matchesFilter(a.scrip, filter))
      .filter((a) => !openOnly || a.currentUnits > 0);
  }, [portfolio, filter, openOnly]);

  const holdings = useMemo(
    () => aggregates.filter((a) => a.currentUnits > 0),
    [aggregates]
  );

  const partialSold = useMemo(
    () =>
      aggregates.filter(
        (a) => a.currentUnits > 0 && a.lifetimeSoldUnits > 0
      ),
    [aggregates]
  );

  const fullyExited = useMemo(() => {
    if (openOnly) return [];
    return aggregates.filter(
      (a) => a.currentUnits === 0 && a.maxHistoricalBalance > 0
    );
  }, [aggregates, openOnly]);

  const summary = useMemo(() => {
    if (!portfolio) {
      return {
        openPositions: 0,
        totalOpenUnits: 0,
        portfolioSoldUnits: 0,
        totalCostBasisNPR: null as number | null,
      };
    }
    const all = portfolio.orderedScrips.map((s) => portfolio.byScrip.get(s)!);
    const open = all.filter((a) => a.currentUnits > 0);
    let costSum = 0;
    let anyCost = false;
    for (const a of open) {
      if (a.totalInvestedNPR != null) {
        costSum += a.totalInvestedNPR;
        anyCost = true;
      }
    }
    return {
      openPositions: open.length,
      totalOpenUnits: open.reduce((s, a) => s + a.currentUnits, 0),
      portfolioSoldUnits: portfolioTotalSoldUnits(portfolio.transactions),
      totalCostBasisNPR: anyCost ? costSum : null,
    };
  }, [portfolio]);

  const selectedAggregate: ScripAggregate | null = useMemo(() => {
    if (!portfolio || !selectedScrip) return null;
    return portfolio.byScrip.get(selectedScrip) ?? null;
  }, [portfolio, selectedScrip]);

  const selectedTxs = useMemo(() => {
    if (!portfolio || !selectedScrip) return [];
    return portfolio.transactions.filter((t) => t.scrip === selectedScrip);
  }, [portfolio, selectedScrip]);

  const purchaseLines = useMemo(() => {
    if (!rawPurchaseCsv) return [];
    try {
      return parsePurchaseCsv(rawPurchaseCsv);
    } catch {
      return [];
    }
  }, [rawPurchaseCsv]);

  const loadFromFileList = useCallback(async (files: FileList | null) => {
    setParseError(null);
    if (!files || files.length === 0) {
      setRawTxCsv(null);
      setRawPurchaseCsv(null);
      setLoadHint(null);
      return;
    }
    try {
      const paired = await pairMeroshareCsvsFromFiles(files);
      setRawTxCsv(paired.transactionsText);
      setRawPurchaseCsv(paired.purchaseText);
      setLoadHint(paired.hint);
    } catch (e) {
      setRawTxCsv(null);
      setRawPurchaseCsv(null);
      setLoadHint(null);
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/80 bg-surface-raised/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
              NEPSE portfolio
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              MeroShare transaction history and purchase source — WACC from FIFO cost.
            </p>
          </div>
          <label className="flex cursor-pointer flex-col gap-1 rounded-xl border border-slate-600 bg-surface-overlay px-4 py-2.5 text-sm text-slate-200 transition hover:border-accent/50 hover:bg-slate-800/50 sm:items-end sm:text-right">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <input
                type="file"
                accept=".csv,text/csv"
                multiple
                className="sr-only"
                onChange={(e) => loadFromFileList(e.target.files)}
              />
              <span className="font-medium text-accent">Load MeroShare exports</span>
            </div>
            <span className="text-xs text-slate-500">
              Select <code className="font-mono text-slate-400">*_transactions.csv</code> and{" "}
              <code className="font-mono text-slate-400">*_purchase_sources.csv</code> together
              (Ctrl/Cmd+click). Purchase pairs by filename and unlocks WACC.
            </span>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        {!rawTxCsv && (
          <div className="rounded-2xl border border-dashed border-slate-600 bg-surface-raised/50 p-10 text-center">
            <p className="text-slate-400">
              Export <strong className="text-slate-300">My Transaction History</strong> and{" "}
              <strong className="text-slate-300">My Purchase Source</strong> from the Python
              scraper, then load both files together (or pick the <code className="font-mono text-slate-400">meroshare/</code> folder). Files stay in your browser.
            </p>
          </div>
        )}

        {loadHint && (
          <div
            className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100/90"
            role="status"
          >
            {loadHint}
          </div>
        )}

        {displayError && (
          <div
            className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200"
            role="alert"
          >
            {displayError}
          </div>
        )}

        {portfolio && (
          <>
            <SummaryCards
              openPositions={summary.openPositions}
              totalOpenUnits={summary.totalOpenUnits}
              portfolioSoldUnits={summary.portfolioSoldUnits}
              totalCostBasisNPR={summary.totalCostBasisNPR}
            />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <label htmlFor="scrip-filter" className="sr-only">
                  Filter by scrip
                </label>
                <input
                  id="scrip-filter"
                  type="search"
                  placeholder="Filter by scrip name…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full max-w-md rounded-xl border border-slate-600 bg-surface-raised px-4 py-2.5 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={openOnly}
                  onChange={(e) => setOpenOnly(e.target.checked)}
                  className="rounded border-slate-600 bg-surface-raised text-accent focus:ring-accent"
                />
                Hide fully sold scrips
              </label>
            </div>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-100">
                Open positions
              </h2>
              <HoldingsTable
                rows={holdings}
                selectedScrip={selectedScrip}
                onSelectScrip={setSelectedScrip}
              />
            </section>

            <SoldSections
              partialSold={partialSold}
              fullyExited={fullyExited}
              selectedScrip={selectedScrip}
              onSelectScrip={setSelectedScrip}
            />
          </>
        )}
      </main>

      {selectedAggregate && (
        <StockDetail
          aggregate={selectedAggregate}
          transactions={selectedTxs}
          purchaseLines={purchaseLines}
          onClose={() => setSelectedScrip(null)}
        />
      )}
    </div>
  );
}
