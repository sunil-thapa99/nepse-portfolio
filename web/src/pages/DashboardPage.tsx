import { useCallback, useEffect, useMemo, useState } from "react";
import { portfolioTotalSoldUnits } from "../lib/aggregatePortfolio";
import { apiUrl } from "../lib/apiUrl";
import {
  buildPortfolioFromDb,
  dbPurchaseSourcesToParsed,
  type DbPurchaseSourceRow,
  type DbTransactionRow,
} from "../lib/mapDbToPortfolio";
import type { PortfolioResult, ScripAggregate } from "../lib/types";
import { supabase } from "../lib/supabaseClient";
import { HoldingsTable } from "../components/HoldingsTable";
import { SoldSections } from "../components/SoldSections";
import { StockDetail } from "../components/StockDetail";
import { SummaryCards } from "../components/SummaryCards";
import { MeroshareCredentials } from "../components/MeroshareCredentials";
import { useAuth } from "../auth/AuthContext";

function matchesFilter(scrip: string, q: string): boolean {
  if (!q.trim()) return true;
  return scrip.toLowerCase().includes(q.trim().toLowerCase());
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatTxDate(raw: string): string {
  if (!raw) return "";
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function formatNum(n: number | string | null | undefined): string {
  if (n == null || n === "") return "—";
  if (typeof n === "number") return Number.isFinite(n) ? String(n) : "—";
  return String(n);
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-accent ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export default function DashboardPage() {
  const { session, loading: authLoading, signOut } = useAuth();
  const [txRows, setTxRows] = useState<DbTransactionRow[]>([]);
  const [purchaseRows, setPurchaseRows] = useState<DbPurchaseSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [selectedScrip, setSelectedScrip] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!session) {
      setTxRows([]);
      setPurchaseRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    const [txRes, purRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .order("transaction_date", { ascending: false }),
      supabase
        .from("purchase_sources")
        .select("*")
        .order("transaction_date", { ascending: false }),
    ]);
    const errs: string[] = [];
    if (txRes.error) errs.push(`Transactions: ${txRes.error.message}`);
    if (purRes.error) errs.push(`Purchase sources: ${purRes.error.message}`);
    setFetchError(errs.length ? errs.join(" ") : null);
    if (!txRes.error) setTxRows((txRes.data ?? []) as DbTransactionRow[]);
    if (!purRes.error)
      setPurchaseRows((purRes.data ?? []) as DbPurchaseSourceRow[]);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setTxRows([]);
      setPurchaseRows([]);
      setLoading(false);
      return;
    }
    void loadData();
  }, [authLoading, session, loadData]);

  const portfolioBuild = useMemo((): {
    portfolio: PortfolioResult | null;
    error: string | null;
  } => {
    if (!txRows.length) return { portfolio: null, error: null };
    try {
      return {
        portfolio: buildPortfolioFromDb(txRows, purchaseRows),
        error: null,
      };
    } catch (e) {
      return { portfolio: null, error: errMsg(e) };
    }
  }, [txRows, purchaseRows]);

  const portfolio = portfolioBuild.portfolio;
  const portfolioError = portfolioBuild.error;

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

  const purchaseLines = useMemo(
    () => dbPurchaseSourcesToParsed(purchaseRows),
    [purchaseRows]
  );

  const handleRefreshScrape = useCallback(async () => {
    if (!session?.access_token) return;
    setScraping(true);
    setScrapeError(null);
    try {
      const res = await fetch(apiUrl("/api/scrape"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = (await res.json().catch(() => ({}))) as {
        detail?: string | { msg?: string }[];
      };
      if (!res.ok) {
        let msg = res.statusText;
        if (typeof body.detail === "string") msg = body.detail;
        else if (Array.isArray(body.detail))
          msg = body.detail.map((x) => String(x)).join("; ");
        setScrapeError(msg);
        return;
      }
      await loadData();
    } catch (e) {
      setScrapeError(errMsg(e));
    } finally {
      setScraping(false);
    }
  }, [session, loadData]);

  const displayError = fetchError ?? portfolioError ?? scrapeError;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-slate-400">
        <Spinner className="h-6 w-6" />
        <span>Loading session…</span>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/80 bg-surface-raised/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
              NEPSE portfolio
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Data from Supabase — WACC from FIFO cost when purchase sources exist.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={scraping || loading}
              onClick={() => void handleRefreshScrape()}
              className="inline-flex items-center gap-2 rounded-lg border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
            >
              {scraping ? <Spinner /> : null}
              Refresh data
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        <MeroshareCredentials />

        {(loading || scraping) && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Spinner />
            {scraping
              ? "Running MeroShare scraper (this may take several minutes)…"
              : "Loading portfolio data…"}
          </div>
        )}

        {!loading && txRows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-600 bg-surface-raised/50 p-10 text-center">
            <p className="text-slate-400">
              No transactions yet. Save your{" "}
              <strong className="text-slate-300">MeroShare credentials</strong> above,
              then click <strong className="text-slate-300">Refresh data</strong> to run
              the scraper and populate your portfolio.
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

        {!loading && txRows.length > 0 && (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-100">
                Transactions
              </h2>
              <div className="overflow-x-auto rounded-xl border border-slate-700/80">
                <table className="min-w-full text-left text-sm text-slate-200">
                  <thead className="border-b border-slate-700 bg-slate-900/50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Scrip</th>
                      <th className="px-3 py-2">Transaction Date</th>
                      <th className="px-3 py-2">Credit Quantity</th>
                      <th className="px-3 py-2">Debit Quantity</th>
                      <th className="px-3 py-2">Balance After Transaction</th>
                      <th className="px-3 py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txRows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-800/80 odd:bg-slate-900/20"
                      >
                        <td className="px-3 py-2 font-mono">{r.scrip}</td>
                        <td className="px-3 py-2 font-mono">
                          {formatTxDate(r.transaction_date)}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatNum(r.credit_quantity)}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatNum(r.debit_quantity)}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatNum(r.balance_after_transaction)}
                        </td>
                        <td className="max-w-md px-3 py-2 text-slate-400">
                          {r.history_description ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-100">
                Purchase sources
              </h2>
              <div className="overflow-x-auto rounded-xl border border-slate-700/80">
                <table className="min-w-full text-left text-sm text-slate-200">
                  <thead className="border-b border-slate-700 bg-slate-900/50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Scrip</th>
                      <th className="px-3 py-2">Transaction Date</th>
                      <th className="px-3 py-2">Quantity</th>
                      <th className="px-3 py-2">Rate</th>
                      <th className="px-3 py-2">Purchase Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-6 text-center text-slate-500"
                        >
                          No purchase source rows yet — run Refresh data after
                          transactions exist.
                        </td>
                      </tr>
                    ) : (
                      purchaseRows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-slate-800/80 odd:bg-slate-900/20"
                        >
                          <td className="px-3 py-2 font-mono">{r.scrip}</td>
                          <td className="px-3 py-2 font-mono">
                            {formatTxDate(r.transaction_date)}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {formatNum(r.quantity)}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {formatNum(r.rate)}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-400">
                            {r.purchase_source}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
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
