# Operations Runbook

Two independent data pipelines feed this project. They are **not** the same
system — a failure in one does not affect the other.

## 1. MeroShare portfolio scrape → Supabase

`main.py` logs into MeroShare (Playwright) for a user, scrapes their portfolio,
and upserts into Supabase. This is what populates the dashboard.

**Tables written** (all keyed by `user_id`, conflict on `(user_id, line_hash)`):

| Table | Contents |
|---|---|
| `transactions` | Transaction history |
| `purchase_sources` | Per-scrip purchase source rows (open scrips) |
| `scrip_ltp` | Latest traded price per open scrip |

Credentials live in the `meroshare_credentials` table; the password and
transaction PIN are decrypted with `ENCRYPTION_KEY` from `.env`.

**Run it:**

```bash
.venv/bin/python main.py --user-id <uuid>        # one user
.venv/bin/python main.py --all-credential-users  # every user in meroshare_credentials
```

Flags: `--no-headless` (watch the browser), `--asba` (apply for IPOs instead of
scraping). Headless is the default.

**Verify in Supabase:** filter any of the three tables by
`user_id = <uuid>`. The run also prints a summary line:
`transactions N scraped → N upserted; purchase … ; ltp …`.

## 2. Market-data CSV crons (launchd)

Separate scrapers pull public NEPSE market data into **CSV files** under
`~/Desktop/Trading/Strategy/scrap_data/NEPSE/`. These do **not** touch Supabase.

Scheduled via launchd (`~/Library/LaunchAgents/com.sunilthapa.nepse.*.plist`):
`fetchfloorsheet`, `fetchfootprint`, `fetchnaasa`, plus `com.options-chain.scrape`.

**Check status / logs:**

```bash
launchctl list | grep nepse                 # last exit code per job (0 = ok)
launchctl kickstart gui/$(id -u)/com.sunilthapa.nepse.fetchfloorsheet  # run now
```

### Gotcha: launchd log path must be OUTSIDE `~/Desktop`

`~/Desktop` (and `~/Documents`, `~/Downloads`) are TCC-protected. A launchd
agent whose `StandardOutPath`/`StandardErrorPath` points inside that tree fails
to open the log and exits **78 (EX_CONFIG) before running** — symptom: a
**0-byte, stale log** and `last exit code = 78: EX_CONFIG`, even though the
script runs fine by hand.

A file that *was* granted access carries a `com.apple.macl` xattr
(`ls -le@ <log>`); one without it gets denied. Fix is to point the log outside
the protected tree, e.g.:

```
StandardOutPath  = /Users/sunilthapa/Library/Logs/fetch_floorsheet_cron.log
StandardErrorPath= /Users/sunilthapa/Library/Logs/fetch_floorsheet_cron.log
```

then reload: `launchctl bootout … ; launchctl bootstrap gui/$(id -u) <plist>`.
(The CSV *output* dir stays on Desktop — only the launchd log must move.)
