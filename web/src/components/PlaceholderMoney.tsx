const TIP = "Cost data not in MeroShare export — add pricing later for WACC / invested / P/L.";

export function PlaceholderMoney() {
  return (
    <span className="text-slate-500" title={TIP}>
      —
    </span>
  );
}
