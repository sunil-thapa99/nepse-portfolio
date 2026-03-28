-- Idempotent scraper upserts: stable line_hash per logical row (SHA-256 hex, same algorithm as Python).
-- Run after 001 / main.sql baseline.

-- transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS line_hash text;

UPDATE transactions
SET
  line_hash = encode(
    digest(
      concat_ws(
        '|',
        user_id::text,
        upper(trim(scrip)),
        transaction_date::text,
        coalesce(trim(coalesce(credit_quantity::text, '')), ''),
        coalesce(trim(coalesce(debit_quantity::text, '')), ''),
        coalesce(trim(coalesce(balance_after_transaction::text, '')), ''),
        trim(coalesce(history_description, ''))
      ),
      'sha256'
    ),
    'hex'
  )
WHERE line_hash IS NULL;

ALTER TABLE transactions ALTER COLUMN line_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_id_line_hash_key
  ON transactions (user_id, line_hash);

-- purchase_sources
ALTER TABLE purchase_sources ADD COLUMN IF NOT EXISTS line_hash text;

UPDATE purchase_sources
SET
  line_hash = encode(
    digest(
      concat_ws(
        '|',
        user_id::text,
        upper(trim(scrip)),
        transaction_date::text,
        coalesce(trim(coalesce(quantity::text, '')), ''),
        coalesce(trim(coalesce(rate::text, '')), ''),
        trim(coalesce(purchase_source, ''))
      ),
      'sha256'
    ),
    'hex'
  )
WHERE line_hash IS NULL;

ALTER TABLE purchase_sources ALTER COLUMN line_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS purchase_sources_user_id_line_hash_key
  ON purchase_sources (user_id, line_hash);
