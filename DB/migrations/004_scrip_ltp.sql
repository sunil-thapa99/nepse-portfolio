-- Add scrip_ltp table for latest LTP by user+scrip.
-- Safe to run on existing databases.

CREATE TABLE IF NOT EXISTS scrip_ltp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scrip text NOT NULL,
  ltp numeric NOT NULL,
  scraped_at timestamptz NOT NULL,
  line_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scrip_ltp_user_id_line_hash_key
  ON scrip_ltp (user_id, line_hash);

ALTER TABLE scrip_ltp ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scrip_ltp'
      AND policyname = 'users see own scrip ltp'
  ) THEN
    CREATE POLICY "users see own scrip ltp"
      ON scrip_ltp FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;
