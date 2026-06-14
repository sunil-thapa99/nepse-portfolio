# nepse-portfolio

A portfolio dashboard for NEPSE holdings. The app signs users in with Supabase, stores their MeroShare credentials securely, scrapes MeroShare transaction data with Playwright, and shows holdings, cost basis, sold positions, and latest traded price data in a React dashboard.

## Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS
- **Auth and database:** Supabase Auth + Supabase Postgres
- **API:** FastAPI
- **Scraper:** Python + Playwright
- **Production API hosting:** Docker, commonly deployed on Render
- **Scheduled scraping:** GitHub Actions

## Architecture

```text
React dashboard
  -> Supabase Auth
  -> Supabase Postgres for portfolio reads
  -> FastAPI for credential save and manual refresh

FastAPI
  -> verifies Supabase JWT
  -> encrypts MeroShare password
  -> starts Playwright scraper in the background

Scraper
  -> logs into MeroShare
  -> scrapes transaction history, purchase source, and LTP data
  -> upserts rows into Supabase
```

The frontend does not talk to GitHub Actions. Manual refresh goes through the FastAPI API. Scheduled refresh runs directly from GitHub Actions into Supabase.

## Data Flow

1. A user signs in with Supabase Auth.
2. The dashboard reads the user's `transactions`, `purchase_sources`, and `scrip_ltp` rows from Supabase.
3. The user saves MeroShare credentials through `POST /api/meroshare/credentials` (username, password, DP ID, CRN, and transaction PIN).
4. The API verifies the Supabase access token and stores the password and transaction PIN encrypted in `meroshare_credentials`.
5. The user clicks **Refresh data**, which calls `POST /refresh`.
6. The API queues `run_scraper()` in the background.
7. The scraper logs into MeroShare and upserts fresh data into Supabase.
8. The dashboard reloads from Supabase and recalculates portfolio summaries in the browser.

For ASBA IPO applications, save credentials with CRN and transaction PIN, then call `POST /refresh/asba` or run `python main.py --user-id UUID --asba`. The scraper logs into MeroShare, opens `#/asba`, and applies for every listing whose share type contains `IPO`.

## Main Files

- `web/` - React dashboard.
- `web/src/pages/DashboardPage.tsx` - main portfolio page and Supabase data loading.
- `web/src/lib/aggregatePortfolio.ts` - portfolio aggregation logic.
- `web/src/lib/applyPurchaseCosts.ts` - purchase source cost basis logic.
- `api_app.py` - FastAPI app for credentials and refresh.
- `main.py` - Playwright MeroShare scraper and CLI entrypoint.
- `scraper_db.py` - Supabase row mapping and upsert helpers.
- `DB/main.sql` - Supabase schema and RLS policies.
- `Dockerfile` - production API image with Chromium.
- `render.yaml` - optional Render Blueprint for the API service.
- `.github/workflows/meroshare-scrape.yml` - scheduled scraper workflow.

## Supabase Schema

The main tables are:

- `meroshare_credentials` - one encrypted MeroShare credential row per user (includes optional `crn` and encrypted `transaction_pin_encrypted` for ASBA).
- `transactions` - scraped MeroShare transaction history.
- `purchase_sources` - scraped purchase source rows used for cost basis.
- `scrip_ltp` - latest traded price per scrip.

All tables use Supabase Row Level Security so signed-in users only access their own data. The Python API and scraper use `SUPABASE_SERVICE_KEY` for trusted server-side writes.

## Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Required for Python API and scraper:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
ENCRYPTION_KEY=
```

Required for the React app:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Required in production when the API is hosted separately from the frontend:

```bash
VITE_API_BASE_URL=https://your-api.example.com
CORS_ALLOW_ORIGINS=https://your-frontend.example.com
```

Generate an encryption key with:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Local Development

Install Python dependencies:

```bash
python -m venv env
export UV_PROJECT_ENVIRONMENT=env
uv sync
```

Run the API from the repo root:

```bash
uv run uvicorn api_app:app --reload --port 8000
```

Run the frontend:

```bash
cd web
npm install
npm run dev
```

Vite proxies `/api` and `/refresh` (including `/refresh/asba`) to `http://127.0.0.1:8000` in local development.

## Scraper CLI

Run a scrape for one user:

```bash
uv run python main.py --user-id 00000000-0000-0000-0000-000000000000
```

Run for every user with saved MeroShare credentials:

```bash
uv run python main.py --all-credential-users
```

Run with a visible browser for debugging:

```bash
uv run python main.py --user-id 00000000-0000-0000-0000-000000000000 --no-headless
```

Apply for ASBA IPO listings for one user (requires CRN and transaction PIN in credentials):

```bash
uv run python main.py --user-id 00000000-0000-0000-0000-000000000000 --asba
```

Apply for every user with saved credentials:

```bash
uv run python main.py --all-credential-users --asba
```

The scraper requires `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `ENCRYPTION_KEY`.

## API Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check for hosts and load balancers. |
| `POST` | `/api/meroshare/credentials` | Saves encrypted MeroShare credentials (incl. CRN and transaction PIN) for the signed-in user. |
| `POST` | `/refresh` | Starts a background scrape for the signed-in user. |
| `POST` | `/refresh/asba` | Starts a background ASBA IPO apply for the signed-in user. |

Both POST endpoints require:

```text
Authorization: Bearer <supabase_access_token>
```

## When to Use Render

Render is useful when you want the FastAPI backend available in production. The React app can be deployed as a static site, but it still needs a server-side API for credential storage and manual refresh.

Use Render, or another Docker-capable backend host, when you need:

- A public backend for `POST /api/meroshare/credentials` and `POST /refresh`.
- A safe place to keep `SUPABASE_SERVICE_KEY` and `ENCRYPTION_KEY`.
- A Linux runtime with Chromium for Playwright scraping.
- Manual refresh from the dashboard.

You may not need Render if you only run scrapes locally or through GitHub Actions. GitHub Actions can update Supabase on a schedule, but it does not provide an always-on API endpoint for the dashboard.

To confirm the deployed frontend is using Render, check `VITE_API_BASE_URL`. If it points to an `https://...onrender.com` URL, the dashboard is calling the Render API. You can also open browser DevTools and inspect the `POST /refresh` request URL.

## Deploying the API

The API is packaged with Docker:

```bash
docker build -t nepse-api .
docker run --rm -p 10000:10000 -e PORT=10000 --env-file .env nepse-api
curl http://localhost:10000/health
```

For Render:

1. Create a Docker Web Service from this repository.
2. Use `Dockerfile` at the repo root.
3. Set the health check path to `/health`.
4. Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ENCRYPTION_KEY`, and `CORS_ALLOW_ORIGINS`.
5. Set the frontend's `VITE_API_BASE_URL` to the Render service URL.

The included `render.yaml` can be used as a Render Blueprint.

## Deploying the Frontend

The frontend is a normal Vite static app:

```bash
cd web
npm install
npm run build
```

For a static host such as Vercel, set:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=https://your-api.onrender.com
VITE_SITE_URL=https://your-frontend.example.com
```

Also configure Supabase Auth URL settings:

- **Site URL:** your production frontend origin.
- **Redirect URLs:** production frontend, preview URLs if needed, and local dev URLs such as `http://localhost:5173`.

## Scheduled Scraping

`.github/workflows/meroshare-scrape.yml` runs:

```bash
python main.py --all-credential-users
```

The workflow needs these GitHub Actions secrets:

```bash
SUPABASE_URL
SUPABASE_SERVICE_KEY
ENCRYPTION_KEY
```

This is separate from the FastAPI API. It is useful for automatic refreshes even when no user clicks **Refresh data** in the dashboard.

## Tests

Run frontend typecheck, build, and unit tests:

```bash
cd web
npm run build
npm test
```

Run Python tests:

```bash
uv run python -m unittest discover -s tests -v
```

## Portfolio Math

The dashboard calculates holdings from transaction history and enriches them with purchase source data when available. Cost basis and WACC use detailed purchase rows, with bonus lots treated as zero-cost units. Latest traded price data is used to estimate unrealized profit or loss for open positions.
