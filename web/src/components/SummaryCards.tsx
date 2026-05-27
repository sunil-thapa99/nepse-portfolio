interface SummaryCardsProps {
  openPositions: number;
  totalOpenUnits: number;
  totalCostBasisNPR: number | null;
  totalProfitLossNPR: number | null;
}

function formatNpr(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedNpr(n: number): string {
  const formatted = formatNpr(n);
  return n > 0 ? `+${formatted}` : formatted;
}

export function SummaryCards({
  openPositions,
  totalOpenUnits,
  totalCostBasisNPR,
  totalProfitLossNPR,
}: SummaryCardsProps) {
  const profitLossTone =
    totalProfitLossNPR == null
      ? "text-slate-500"
      : totalProfitLossNPR >= 0
        ? "text-emerald-300"
        : "text-rose-300";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700/80 bg-surface-raised p-4 shadow-lg shadow-black/20">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Open positions
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-100">
            {openPositions}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-surface-raised p-4 shadow-lg shadow-black/20">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Units held
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-100">
            {totalOpenUnits.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700/80 bg-surface-raised p-4 shadow-lg shadow-black/20">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Cost basis (NPR)
          </p>
          <p
            className={`mt-1 font-mono text-2xl font-semibold ${
              totalCostBasisNPR != null ? "text-emerald-200/90" : "text-slate-500"
            }`}
            title="FIFO cost from purchase CSV for open positions."
          >
            {totalCostBasisNPR != null ? formatNpr(totalCostBasisNPR) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-surface-raised p-4 shadow-lg shadow-black/20">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Profit/loss (NPR)
          </p>
          <p
            className={`mt-1 font-mono text-2xl font-semibold ${profitLossTone}`}
            title="Unrealized profit/loss from LTP minus FIFO WACC for open positions."
          >
            {totalProfitLossNPR != null
              ? formatSignedNpr(totalProfitLossNPR)
              : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
