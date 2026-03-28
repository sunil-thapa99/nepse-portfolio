import { useCallback, useMemo, useState } from "react";
import {
  aggregatePortfolio,
  portfolioTotalSoldUnits,
} from "./lib/aggregatePortfolio";
import { parseMeroshareCsv } from "./lib/parseMeroshare";
import type { PortfolioResult, ScripAggregate } from "./lib/types";
import { HoldingsTable } from "./components/HoldingsTable";
import { SoldSections } from "./components/SoldSections";
import { StockDetail } from "./components/StockDetail";
import { SummaryCards } from "./components/SummaryCards";

function matchesFilter(scrip: string, q: string): boolean {
  if (!q.trim()) return true;
  return scrip.toLowerCase().includes(q.trim().toLowerCase());
}

export default function App() {
  const [rawCsv, setRawCsv] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedScrip, setSelectedScrip] = useState<string | null>(null);

  const portfolio: PortfolioResult | null = useMemo(() => {
    if (!rawCsv) return null;
    try {
      const txs = parseMeroshareCsv(rawCsv);
      return aggregatePortfolio(txs);
    } catch (e) {
      return null;
    }
  }, [rawCsv]);

  const loadError = useMemo(() => {
    if (!rawCsv) return null;
    if (portfolio) return null;
    try {
      parseMeroshareCsv(rawCsv);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "Could not parse CSV.";
  }, [rawCsv, portfolio]);

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
      };
    }
    const all = portfolio.orderedScrips.map((s) => portfolio.byScrip.get(s)!);
    const open = all.filter((a) => a.currentUnits > 0);
    return {
      openPositions: open.length,
      totalOpenUnits: open.reduce((s, a) => s + a.currentUnits, 0),
      portfolioSoldUnits: portfolioTotalSoldUnits(portfolio.transactions),
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

  const onFile = useCallback((file: File | null) => {
    setParseError(null);
    if (!file) {
      setRawCsv(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setRawCsv(text);
    };
    reader.onerror = () => {
      setParseError("Failed to read file.");
    };
    reader.readAsText(file, "UTF-8");
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
              MeroShare transaction history — units, sells, and drill-down.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-600 bg-surface-overlay px-4 py-2.5 text-sm text-slate-200 transition hover:border-accent/50 hover:bg-slate-800/50">
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <span className="font-medium text-accent">Load CSV</span>
            <span className="text-slate-500">MeroShare export</span>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        {!rawCsv && (
          <div className="rounded-2xl border border-dashed border-slate-600 bg-surface-raised/50 p-10 text-center">
            <p className="text-slate-400">
              Export <strong className="text-slate-300">My Transaction History</strong>{" "}
              from MeroShare as CSV, then load it here. Your file stays in the
              browser.
            </p>
            <p className="mt-3 text-xs text-slate-600">
              {/* Optional dev: place a copy at web/public/sample.csv and fetch in useEffect */}
              Optional: for local dev, copy a CSV to{" "}
              <code className="rounded bg-slate-800 px-1 py-0.5 font-mono text-slate-400">
                web/public/sample.csv
              </code>{" "}
              and wire a fetch if you want auto-load.
            </p>
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
          onClose={() => setSelectedScrip(null)}
        />
      )}
    </div>
  );
}
