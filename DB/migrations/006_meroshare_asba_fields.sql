-- ASBA IPO apply: CRN and encrypted transaction PIN on meroshare_credentials.
-- Safe to run on existing databases.

ALTER TABLE meroshare_credentials
  ADD COLUMN IF NOT EXISTS crn text,
  ADD COLUMN IF NOT EXISTS transaction_pin_encrypted text;
