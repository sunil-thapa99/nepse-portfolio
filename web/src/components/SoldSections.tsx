import type { ReactNode } from "react";
import type { ScripAggregate } from "../lib/types";

interface SoldSectionsProps {
  partialSold: ScripAggregate[];
  fullyExited: ScripAggregate[];
  selectedScrip: string | null;
  onSelectScrip: (scrip: string) => void;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-100">
      {children}
    </h2>
  );
}

function MiniTable({
  rows,
  columns,
  selectedScrip,
  onSelectScrip,
}: {
  rows: ScripAggregate[];
  columns: { key: string; label: string; render: (r: ScripAggregate) => ReactNode }[];
  selectedScrip: string | null;
  onSelectScrip: (scrip: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-600 p-4 text-sm text-slate-500">
        None match the current filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/80 bg-surface-raised">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="border-b border-slate-700/80 bg-surface-overlay/50">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-4 py-2.5 font-medium text-slate-400"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = selectedScrip === r.scrip;
            return (
              <tr
                key={r.scrip}
                onClick={() => onSelectScrip(r.scrip)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectScrip(r.scrip);
                  }
                }}
                tabIndex={0}
                role="button"
                className={`cursor-pointer border-b border-slate-800/80 transition-colors hover:bg-surface-overlay/80 focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                  active ? "bg-accent/10" : ""
                }`}
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-2 font-mono tabular-nums">
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SoldSections({
  partialSold,
  fullyExited,
  selectedScrip,
  onSelectScrip,
}: SoldSectionsProps) {
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <section>
        <SectionTitle>Sold units (still holding)</SectionTitle>
        <p className="mb-3 text-sm text-slate-500">
          Positions where you sold at least once but still have units.
        </p>
        <MiniTable
          rows={partialSold}
          selectedScrip={selectedScrip}
          onSelectScrip={onSelectScrip}
          columns={[
            {
              key: "scrip",
              label: "Scrip",
              render: (r) => (
                <span className="font-semibold text-accent">{r.scrip}</span>
              ),
            },
            {
              key: "current",
              label: "Current units",
              render: (r) => r.currentUnits.toLocaleString(),
            },
            {
              key: "sold",
              label: "Total sold",
              render: (r) => r.lifetimeSoldUnits.toLocaleString(),
            },
          ]}
        />
      </section>
      <section>
        <SectionTitle>Fully sold (0 units)</SectionTitle>
        <p className="mb-3 text-sm text-slate-500">
          Scrips you exited completely (no remaining balance).
        </p>
        <MiniTable
          rows={fullyExited}
          selectedScrip={selectedScrip}
          onSelectScrip={onSelectScrip}
          columns={[
            {
              key: "scrip",
              label: "Scrip",
              render: (r) => (
                <span className="font-semibold text-slate-300">{r.scrip}</span>
              ),
            },
            {
              key: "sold",
              label: "Total sold",
              render: (r) => r.lifetimeSoldUnits.toLocaleString(),
            },
            {
              key: "exit",
              label: "Last sale date",
              render: (r) => r.lastSellDate ?? "—",
            },
          ]}
        />
      </section>
    </div>
  );
}
