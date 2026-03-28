interface SummaryCardsProps {
  openPositions: number;
  totalOpenUnits: number;
  portfolioSoldUnits: number;
  totalCostBasisNPR: number | null;
}

function formatNpr(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function SummaryCards({
  openPositions,
  totalOpenUnits,
  portfolioSoldUnits,
  totalCostBasisNPR,
}: SummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="rounded-xl border border-slate-700/80 bg-surface-raised p-4 shadow-lg shadow-black/20">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Lifetime sold (all scrips)
        </p>
        <p className="mt-1 font-mono text-2xl font-semibold text-amber-200/90">
          {portfolioSoldUnits.toLocaleString()}
        </p>
      </div>
      <div className="rounded-xl border border-slate-700/80 bg-surface-raised p-4 shadow-lg shadow-black/20">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Cost basis (open, NPR)
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
    </div>
  );
}
