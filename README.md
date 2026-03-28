# nepse-portfolio

Small utility to log into [MeroShare](https://meroshare.cdsc.com.np/), export **My Transaction History** to CSV, then scrape **My Purchase Source** for open positions (default). You can limit the run to transactions or purchase only with `--mode`.

## Requirements

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (recommended) or another PEP 621–aware installer
- [Google Chrome](https://www.google.com/chrome/) installed (Selenium drives Chrome; Selenium 4 resolves a matching ChromeDriver automatically in most setups)

## Setup

```bash
uv sync
```

This creates a virtual environment (typically `.venv/`) and installs dependencies from [`pyproject.toml`](pyproject.toml) and the lockfile [`uv.lock`](uv.lock). Commit `uv.lock` so everyone gets the same versions.

## Configuration

Copy the example env file and fill in your MeroShare credentials:

```bash
cp .env.example .env
```

Variables:

| Variable             | Description                                                                 |
| -------------------- | --------------------------------------------------------------------------- |
| `MEROSHARE_USERNAME` | Your MeroShare login ID                                                     |
| `MEROSHARE_PASSWORD` | Your MeroShare password                                                     |
| `MEROSHARE_DP`       | Depository Participant name (as shown in the DP dropdown on the login page) |

Optional:

| Variable                 | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `MEROSHARE_OUT`          | Default output path for `--out` (see below)                              |
| `MEROSHARE_PURCHASE_OUT` | Default output path for `--purchase-out` (default run includes purchase) |

## Usage

### Default: login, transactions, then purchase

By default (`--mode both`), the script logs in, downloads **My Transaction History** as CSV, derives **open scrips** (balance &gt; 0) from that scrape, then opens **My Purchase Source** and searches each scrip, merging `table.table` results into one purchase CSV.

```bash
uv run python main.py
```

Run with a visible browser (useful for debugging):

```bash
uv run python main.py --no-headless
```

Override output paths:

```bash
uv run python main.py --out meroshare/custom_name.csv --purchase-out meroshare/custom_purchase.csv
```

If `--out` is omitted and `MEROSHARE_OUT` is not set, transactions are written to:

`meroshare/<username>_transactions.csv`

Purchase rows go to `meroshare/<username>_purchase_sources.csv` unless you set `--purchase-out` or `MEROSHARE_PURCHASE_OUT`. Re-running overwrites those files.

### Transaction history only

To skip purchase scraping and only export the transaction CSV:

```bash
uv run python main.py --mode transactions
```

### My Purchase Source only

**My Purchase Source** (`#/purchase`) searches each **open** scrip, merges every `table.table` on the results page per search, and appends rows into one CSV with a `query_scrip` column.

| Mode           | Description                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `both`         | Default: transaction CSV, then purchase tables for open scrips from that scrape. |
| `transactions` | Only My Transaction History CSV.                                                 |
| `purchase`     | Only purchase tables; requires `--transactions-csv` and/or `--scrips`.           |

Examples:

```bash
# Open scrips inferred from an existing transaction export (no live transaction scrape)
uv run python main.py --mode purchase --transactions-csv meroshare/yourname_transactions.csv --no-headless

# Fixed list (debug / partial run)
uv run python main.py --mode purchase --scrips SHEL,ADBL --no-headless
```

If MeroShare changes the purchase page, you may need to adjust selectors in `main.py` (`input[name="script"]`, Search button, `table.table`).

## Output

Exports land under `meroshare/` by default (that directory is gitignored). Each row includes a `scraped_at` timestamp column.

## Transaction dashboard (React)

A local-only viewer lives in [`web/`](web/). It parses the same MeroShare CSV in the browser (no upload to a server).

```bash
cd web
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`), load **Transactions** (My Transaction History CSV), then optionally **Purchase source** — the merged `*_purchase_sources.csv` from the Python scraper. **WACC** and **Invested** use a **weighted average** from purchase **detail** rows when present (BONUS lots count as zero NPR cost in the numerator); otherwise the MeroShare **summary** row is used. The stock detail table adds a **Rate (NPR)** column by matching purchase lines to buy rows on date and quantity. Symbols without usable purchase data still show em dashes for those fields.

Optional: copy CSVs to `web/public/` for experiments; you can add a `fetch("/sample.csv")` in dev if you want auto-load.

```bash
cd web
npm run build   # production build to web/dist
npm test        # unit tests (parser aggregates)
```
