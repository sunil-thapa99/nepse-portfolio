-- Narrow line_hash preimage to natural keys (same algorithm as scraper_db.py).
-- transactions: user_id | scrip | transaction_date | credit_quantity | debit_quantity
-- purchase_sources: user_id | scrip | transaction_date | quantity
-- Run after 002_scraper_upsert.sql on databases that already have rows.

-- transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS line_hash_new text;

UPDATE transactions
SET
  line_hash_new = encode(
    digest(
      concat_ws(
        '|',
        user_id::text,
        upper(trim(scrip)),
        transaction_date::text,
        coalesce(trim(coalesce(credit_quantity::text, '')), ''),
        coalesce(trim(coalesce(debit_quantity::text, '')), '')
      ),
      'sha256'
    ),
    'hex'
  );

DELETE FROM transactions a
USING (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, line_hash_new
      ORDER BY scraped_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM transactions
) d
WHERE a.id = d.id AND d.rn > 1;

UPDATE transactions SET line_hash = line_hash_new;

ALTER TABLE transactions DROP COLUMN line_hash_new;

-- purchase_sources
ALTER TABLE purchase_sources ADD COLUMN IF NOT EXISTS line_hash_new text;

UPDATE purchase_sources
SET
  line_hash_new = encode(
    digest(
      concat_ws(
        '|',
        user_id::text,
        upper(trim(scrip)),
        transaction_date::text,
        coalesce(trim(coalesce(quantity::text, '')), '')
      ),
      'sha256'
    ),
    'hex'
  );

DELETE FROM purchase_sources a
USING (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, line_hash_new
      ORDER BY scraped_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM purchase_sources
) d
WHERE a.id = d.id AND d.rn > 1;

UPDATE purchase_sources SET line_hash = line_hash_new;

ALTER TABLE purchase_sources DROP COLUMN line_hash_new;
