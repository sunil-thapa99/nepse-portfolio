import type { ScrapeJobRow } from "../lib/scrapeJobs";

type ScrapeProgressCardProps = {
  job: ScrapeJobRow | null;
  isStarting: boolean;
  subscriptionError?: string | null;
  onDismiss?: () => void;
};

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-accent"
      role="status"
      aria-label="Scraping"
    />
  );
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function ScrapeProgressCard({
  job,
  isStarting,
  subscriptionError,
  onDismiss,
}: ScrapeProgressCardProps) {
  const failed = Boolean(job?.failed);
  const completed = Boolean(job?.completed);
  const isActive = isStarting || (!completed && !failed);
  const progress = Math.max(0, Math.min(100, job?.progress ?? 5));
  const message =
    job?.error_message ??
    job?.message ??
    (isStarting ? "Starting scraper..." : "Waiting for scraper updates...");
  const timestamp = formatDateTime(job?.completed_at ?? job?.started_at);

  return (
    <div
      className={`rounded-2xl border px-4 py-4 shadow-lg shadow-black/20 ${
        failed
          ? "border-rose-900/60 bg-rose-950/40 text-rose-100"
          : completed
            ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-100"
            : "border-slate-700/80 bg-surface-raised/95 text-slate-100"
      }`}
      role={failed ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            {isActive && !failed ? <Spinner /> : null}
            <p className="font-medium">
              {failed
                ? "Scrape failed"
                : completed
                  ? "Scrape completed"
                  : "Refreshing MeroShare data"}
            </p>
          </div>
          <p className="text-sm text-slate-300">{message}</p>
          {subscriptionError ? (
            <p className="text-xs text-amber-300">{subscriptionError}</p>
          ) : null}
          {timestamp ? (
            <p className="text-xs text-slate-500">
              {completed || failed ? "Finished" : "Started"} {timestamp}
            </p>
          ) : null}
        </div>

        {(completed || failed) && onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/50"
          >
            Dismiss
          </button>
        ) : null}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            failed ? "bg-rose-500" : completed ? "bg-emerald-400" : "bg-accent"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{job?.status ?? "starting"}</span>
        <span className="font-mono tabular-nums">{progress}%</span>
      </div>
    </div>
  );
}
