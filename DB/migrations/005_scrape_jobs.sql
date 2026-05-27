-- Add scrape_jobs for realtime scraper progress updates.
-- Safe to run on existing databases.

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  message text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  failed boolean NOT NULL DEFAULT false,
  error_message text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scrape_jobs_user_id_created_at_idx
  ON scrape_jobs (user_id, created_at DESC);

ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scrape_jobs'
      AND policyname = 'users see own scrape jobs'
  ) THEN
    CREATE POLICY "users see own scrape jobs"
      ON scrape_jobs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scrape_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE scrape_jobs;
  END IF;
END $$;
