import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ParsedTransaction, ScripAggregate, TxCategory } from "../lib/types";

const CATEGORY_ORDER: TxCategory[] = [
  "IPO",
  "Secondary buy",
  "Bonus",
  "Rights",
  "Rearrangement",
  "Other",
  "Sell",
];

const CATEGORY_COLORS: Record<TxCategory, string> = {
  IPO: "#22c55e",
  "Secondary buy": "#3d9cf0",
  Bonus: "#a78bfa",
  Rights: "#f472b6",
  Rearrangement: "#fbbf24",
  Other: "#94a3b8",
  Sell: "#f87171",
};

interface StockDetailProps {
  aggregate: ScripAggregate;
  transactions: ParsedTransaction[];
  onClose: () => void;
}

function buildBalanceSeries(txs: ParsedTransaction[]) {
  let b = 0;
  return txs.map((tx) => {
    b += tx.credit - tx.debit;
    return {
      date: tx.date,
      balance: b,
      label: `${tx.date} · ${tx.category}`,
    };
  });
}

export function StockDetail({
  aggregate,
  transactions,
  onClose,
}: StockDetailProps) {
  const balanceSeries = useMemo(
    () => buildBalanceSeries(transactions),
    [transactions]
  );

  const barData = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => ({
      name: cat,
      units: aggregate.creditsByCategory[cat],
      fill: CATEGORY_COLORS[cat],
    })).filter((d) => d.units > 0);
  }, [aggregate.creditsByCategory]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:flex-row sm:items-stretch sm:justify-end sm:p-4">
      <button
        type="button"
        className="absolute inset-0 z-0 bg-black/65 sm:static sm:z-auto sm:flex-1 sm:rounded-l-2xl"
        aria-label="Close panel"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex h-full w-full max-w-2xl flex-col border-slate-700/80 bg-surface shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:rounded-r-2xl sm:border-l"
        role="dialog"
        aria-labelledby="stock-detail-title"
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-700/80 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Transaction history
            </p>
            <h2
              id="stock-detail-title"
              className="font-mono text-xl font-bold text-accent"
            >
              {aggregate.scrip}
            </h2>
            <p className="text-sm text-slate-400">
              Current {aggregate.currentUnits.toLocaleString()} units · Sold
              lifetime {aggregate.lifetimeSoldUnits.toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-surface-overlay hover:text-white"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <section className="mb-8">
            <h3 className="mb-2 text-sm font-semibold text-slate-300">
              Units over time
            </h3>
            <div className="h-56 w-full rounded-lg border border-slate-700/60 bg-surface-raised p-2">
              {balanceSeries.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No rows.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={balanceSeries}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1c2633",
                        border: "1px solid #334155",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="balance"
                      stroke="#3d9cf0"
                      strokeWidth={2}
                      dot={false}
                      name="Units"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="mb-8">
            <h3 className="mb-2 text-sm font-semibold text-slate-300">
              Credited units by category
            </h3>
            <div className="h-52 w-full rounded-lg border border-slate-700/60 bg-surface-raised p-2">
              {barData.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  No credit transactions.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#334155"
                      opacity={0.5}
                    />
                    <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1c2633",
                        border: "1px solid #334155",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="units" radius={[0, 4, 4, 0]}>
                      {barData.map((d) => (
                        <Cell key={d.name} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-300">
              All transactions (oldest first)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-700/80">
              <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
                <thead className="bg-surface-overlay/80">
                  <tr className="text-slate-400">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Credit</th>
                    <th className="px-3 py-2 font-medium">Debit</th>
                    <th className="px-3 py-2 font-medium">Balance</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr
                      key={tx.sn}
                      className="border-t border-slate-800/80 hover:bg-surface-overlay/40"
                    >
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-300">
                        {tx.date}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                          {tx.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-emerald-300/90">
                        {tx.credit > 0 ? tx.credit.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-rose-300/90">
                        {tx.debit > 0 ? tx.debit.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-200">
                        {tx.balanceAfter.toLocaleString()}
                      </td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-slate-500" title={tx.description}>
                        {tx.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
