import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import type { ScripAggregate } from "../lib/types";
import { PlaceholderMoney } from "./PlaceholderMoney";

interface HoldingsTableProps {
  rows: ScripAggregate[];
  selectedScrip: string | null;
  onSelectScrip: (scrip: string) => void;
}

function formatNpr(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function HoldingsTable({
  rows,
  selectedScrip,
  onSelectScrip,
}: HoldingsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "scrip", desc: false },
  ]);

  const columns = useMemo<ColumnDef<ScripAggregate>[]>(
    () => [
      {
        accessorKey: "scrip",
        header: "Scrip",
        cell: (info) => (
          <span className="font-mono font-semibold text-accent">
            {info.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "currentUnits",
        header: "Units",
        cell: (info) => (
          <span className="font-mono tabular-nums">
            {(info.getValue() as number).toLocaleString()}
          </span>
        ),
      },
      {
        id: "wacc",
        header: () => (
          <span title="Weighted average cost (NPR) — FIFO from purchase CSV.">
            WACC
          </span>
        ),
        accessorFn: (row) => row.waccNPR,
        cell: (info) => {
          const v = info.getValue() as number | null;
          if (v == null) return <PlaceholderMoney />;
          return (
            <span className="font-mono tabular-nums text-slate-200">
              {formatNpr(v)}
            </span>
          );
        },
      },
      {
        id: "invested",
        header: () => (
          <span title="Remaining cost basis (NPR) — FIFO from purchase CSV.">
            Invested
          </span>
        ),
        accessorFn: (row) => row.totalInvestedNPR,
        cell: (info) => {
          const v = info.getValue() as number | null;
          if (v == null) return <PlaceholderMoney />;
          return (
            <span className="font-mono tabular-nums text-slate-200">
              {formatNpr(v)}
            </span>
          );
        },
      },
      {
        accessorKey: "lastActivityDate",
        header: "Last activity",
        cell: (info) => (
          <span className="text-slate-400">
            {(info.getValue() as string | null) ?? "—"}
          </span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-600 p-6 text-center text-slate-500">
        No open positions match the filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700/80 bg-surface-raised">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-700/80 bg-surface-overlay/50">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="px-4 py-3 font-medium text-slate-400"
                >
                  {h.isPlaceholder ? null : (
                    <button
                      type="button"
                      className={
                        h.column.getCanSort()
                          ? "inline-flex items-center gap-1 hover:text-slate-200"
                          : undefined
                      }
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc"
                        ? " ↑"
                        : h.column.getIsSorted() === "desc"
                          ? " ↓"
                          : null}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const scrip = row.original.scrip;
            const active = selectedScrip === scrip;
            return (
              <tr
                key={row.id}
                onClick={() => onSelectScrip(scrip)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectScrip(scrip);
                  }
                }}
                tabIndex={0}
                role="button"
                className={`cursor-pointer border-b border-slate-800/80 transition-colors hover:bg-surface-overlay/80 focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                  active ? "bg-accent/10" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
