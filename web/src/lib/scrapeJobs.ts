export type ScrapeJobStatus = "running" | "completed" | "failed" | string;

export type ScrapeJobRow = {
  id: string;
  user_id: string;
  status: ScrapeJobStatus;
  progress: number;
  message: string;
  completed: boolean;
  failed: boolean;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type RefreshResponse = {
  jobId?: string;
  status?: string;
  detail?: string | { msg?: string }[];
};

export function isTerminalScrapeJob(job: ScrapeJobRow | null): boolean {
  return Boolean(job?.completed || job?.failed);
}
