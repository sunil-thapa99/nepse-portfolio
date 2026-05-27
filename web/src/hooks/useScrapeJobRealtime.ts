import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  isTerminalScrapeJob,
  type ScrapeJobRow,
} from "../lib/scrapeJobs";

type Channel = ReturnType<typeof supabase.channel>;

type UseScrapeJobRealtimeResult = {
  job: ScrapeJobRow | null;
  subscriptionError: string | null;
};

export function useScrapeJobRealtime(
  jobId: string | null
): UseScrapeJobRealtimeResult {
  const [job, setJob] = useState<ScrapeJobRow | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const channelRef = useRef<Channel | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!jobId) {
      setJob(null);
      setSubscriptionError(null);
      return;
    }

    setSubscriptionError(null);

    const removeExistingChannel = () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };

    removeExistingChannel();

    void supabase
      .from("scrape_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setSubscriptionError(error.message);
          return;
        }
        setJob((data ?? null) as ScrapeJobRow | null);
      });

    const channel = supabase
      .channel(`scrape-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "scrape_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          setJob(payload.new as ScrapeJobRow);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setSubscriptionError("Realtime connection failed for scrape progress.");
        }
      });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      removeExistingChannel();
    };
  }, [jobId]);

  useEffect(() => {
    if (!isTerminalScrapeJob(job) || !channelRef.current) return;
    void supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  }, [job]);

  return { job, subscriptionError };
}
