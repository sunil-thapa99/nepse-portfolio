# nepse-portfolio

Utility to log into [MeroShare](https://meroshare.cdsc.com.np/), pull **My Transaction History** (downloaded in the browser to a temp file, then parsed), and scrape **My Purchase Source** HTML tables for open positions. The **CLI requires `--user-id`**: it upserts into Supabase tables **`transactions`** and **`purchase_sources`** (see [`DB/main.sql`](DB/main.sql)); nothing is written to user-facing CSV paths.

The **React dashboard** loads both tables with the Supabase client only—no CSV upload or file pairing.

## Requirements

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (recommended) or another PEP 621–aware installer
- [Google Chrome](https://www.google.com/chrome/) installed (Selenium drives Chrome; Selenium 4 resolves a matching ChromeDriver automatically in most setups)

## Setup

Use a virtual environment in the project directory named `env/` (not `.venv`). Point uv at it so it does not create a separate `.venv`:

```bash
python -m venv env   # skip if env/ already exists
export UV_PROJECT_ENVIRONMENT=env   # Windows (cmd): set UV_PROJECT_ENVIRONMENT=env
uv sync
```

`uv sync` installs dependencies from [`pyproject.toml`](pyproject.toml) and the lockfile [`uv.lock`](uv.lock) into `env/`. Commit `uv.lock` so everyone gets the same versions.

Optional: `source env/bin/activate` when you want `python` / `pip` on your `PATH` without the `uv` prefix. To sync into an activated venv instead of using `UV_PROJECT_ENVIRONMENT`, run `uv sync --active`.

## Configuration

Copy the example env file and set Supabase and API values:

```bash
cp .env.example .env
```

| Variable                 | Description                                                                 |
| ------------------------ | ----------------------------------------------------------------------------- |
| `SUPABASE_URL`           | Project URL (Supabase **Settings → API**; Python API and scraper)           |
| `VITE_SUPABASE_URL`      | Same URL as `SUPABASE_URL` (React app; Vite exposes only `VITE_*` to the browser) |
| `VITE_SUPABASE_ANON_KEY` | Anon/public key (used by the React app)                                     |
| `VITE_API_BASE_URL`      | Optional. Set in production when the API is not same-origin (see [Transaction dashboard](#transaction-dashboard-react)); omit locally so Vite proxies `/api` and `/refresh` |
| `SUPABASE_SERVICE_KEY`   | Service role key (Python Supabase client and the credentials API; keep secret) |
| `ENCRYPTION_KEY`         | Fernet key for encrypting MeroShare passwords stored in the database (API)   |
| `CORS_ALLOW_ORIGINS`     | Comma-separated browser origins allowed to call the FastAPI app (default: local Vite URLs). Set to your Vercel/Netlify site URL(s) in production. |

Generate `ENCRYPTION_KEY`:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Scraper CLI (`--user-id` required)

The scraper loads `username`, `password_encrypted`, and `dp_id` from **`meroshare_credentials`** using the **service role** client, decrypts the password with **`ENCRYPTION_KEY`** (same Fernet key as [`api_app.py`](api_app.py)), and **upserts** rows into **`transactions`** and **`purchase_sources`** with a stable **`line_hash`**.

**Prerequisites:**

1. Apply the SQL migration [`DB/migrations/002_scraper_upsert.sql`](DB/migrations/002_scraper_upsert.sql) (adds `line_hash` and unique `(user_id, line_hash)` on both tables). Fresh installs using [`DB/main.sql`](DB/main.sql) already include these columns.
2. The user must have saved MeroShare credentials once via the dashboard (POST `/api/meroshare/credentials` with a valid JWT) so a `meroshare_credentials` row exists.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and **`ENCRYPTION_KEY`** in `.env` (same as the API).

Examples:

```bash
# Transaction export → upsert transactions → purchase source for open scrips
uv run python main.py --user-id 00000000-0000-0000-0000-000000000000

# Visible browser (debugging)
uv run python main.py --user-id 00000000-0000-0000-0000-000000000000 --no-headless
```

Each run: transaction export in browser → upsert **`transactions`** → derive open scrips (`balance > 0` from the scrape) → scrape **My Purchase Source** HTML → upsert **`purchase_sources`**. If there are no open positions, purchase scraping is skipped.

If MeroShare changes the purchase page, you may need to adjust selectors in `main.py` (`input[name="script"]`, Search button, result tables).

## Transaction dashboard (React)

The app in [`web/`](web/) loads **`transactions`** and **`purchase_sources`** from Supabase for the signed-in user (RLS limits rows to `auth.uid()`). Sign in with Supabase Auth, save MeroShare credentials via **POST `/api/meroshare/credentials`**, then use **Refresh data** to run the scraper.

**Refresh data** calls **POST `/refresh`** with the user’s JWT. The API verifies the token, checks that `meroshare_credentials` exists, then starts the Selenium scraper in a **background task** and returns immediately (`{"status": "scraper started"}`). The dashboard shows a short success message and refetches from Supabase once after a delay; data updates when the server-side scrape finishes.

The **hosted API** must have **Chrome/Chromium** (and a matching driver, or Selenium Manager) plus `SUPABASE_*`, `ENCRYPTION_KEY`, and enough memory—same as running [`main.py`](main.py) locally. **Scheduled** scrapes can continue to run only in [GitHub Actions](.github/workflows/meroshare-scrape.yml) (`python main.py --user-id …`) so the API does not need a browser if you only use the cron job.

**Deploying the API (e.g. Render, Railway):** use a **Dockerfile** or install **chromium** and **chromedriver** on the host (similar to the Actions workflow). The scraper already passes `--headless=new`, `--no-sandbox`, and `--disable-dev-shm-usage` for container-friendly Chrome. Set `CORS_ALLOW_ORIGINS` to your frontend origin(s). If the browser binary is non-standard, set `CHROME_BIN` (or adjust Selenium options) per your platform’s docs.

**Development:** run the API and the Vite dev server in two terminals (from the repo root, with `.env` loaded and `ENCRYPTION_KEY` set):

```bash
uv run uvicorn api_app:app --reload --port 8000
```

```bash
cd web
npm install
npm run dev
```

Vite proxies `/api` and `/refresh` to `http://127.0.0.1:8000`. Open the URL Vite prints (usually `http://localhost:5173`). **WACC** and **Invested** use a **weighted average** from purchase **detail** rows when present (BONUS lots count as zero NPR cost in the numerator); otherwise the MeroShare **summary** row is used. The stock detail table adds a **Rate (NPR)** column by matching purchase lines to buy rows on date and quantity. Symbols without usable purchase data still show em dashes for those fields.

For production, set `VITE_API_BASE_URL` to your API origin (including scheme, no trailing slash) if it is not same-origin as the static site, and set `CORS_ALLOW_ORIGINS` on the API to that frontend origin.

```bash
cd web
npm run build   # production build to web/dist
npm test        # Vitest (frontend lib + components)
```

**Python tests** (from repo root, uses the same `uv` environment as the scraper):

```bash
uv run python -m unittest discover -s tests -v
```
