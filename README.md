# nepse-portfolio

Stack: **React** (dashboard), **FastAPI** (API + scrape trigger), **Selenium** (MeroShare), **Supabase** (auth + Postgres), optional **GitHub Actions** (scheduled scrape).

The scraper logs into [MeroShare](https://meroshare.cdsc.com.np/), exports **My Transaction History** to a temp CSV, parses it, then scrapes **My Purchase Source** HTML for open positions. It **upserts** **`transactions`** and **`purchase_sources`** in Supabase (see [`DB/main.sql`](DB/main.sql)); there is no user-facing CSV export path.

---

## Architecture and data flow

| Piece | Role |
| ----- | ---- |
| **React** ([`web/`](web/)) | Reads **`transactions`** and **`purchase_sources`** with the Supabase client (RLS → signed-in user). Calls FastAPI only to save credentials and to start a scrape. |
| **FastAPI** ([`api_app.py`](api_app.py)) | Verifies JWTs against Supabase Auth, encrypts passwords to **`meroshare_credentials`**, queues **`run_scraper()`** on **POST `/refresh`** (non-blocking). |
| **Scraper** ([`main.py`](main.py)) | **`run_scraper(user_id, …)`** loads credentials from Supabase, runs headless Chrome, upserts tables. Used by the API (in-process background task) and by **CLI / GitHub Actions** (`python main.py --user-id …` or **`--all-credential-users`**). |
| **GitHub Actions** ([`.github/workflows/meroshare-scrape.yml`](.github/workflows/meroshare-scrape.yml)) | Cron (or manual) run of **`python main.py --all-credential-users`** (every row in **`meroshare_credentials`**). Does **not** call FastAPI. |

**Frontend never talks to GitHub Actions.** Manual refresh goes **React → FastAPI → `run_scraper` → Supabase**. Scheduled refresh goes **Actions → `main.py` → Supabase**.

---

## End-to-end dashboard flow

1. User signs in with **Supabase Auth**; the app loads portfolio rows from Supabase.
2. User saves MeroShare username/password/DP via **POST `/api/meroshare/credentials`** (Bearer JWT). The API stores an encrypted password in **`meroshare_credentials`**.
3. User clicks **Refresh data** → **POST `/refresh`** (Bearer JWT). The API checks that credentials exist, enqueues **`run_scraper`** in a **background task**, and returns immediately **`{"status": "scraper started"}`**.
4. The UI shows a short loading state, then a success message. The scrape continues on the server; the app may refetch from Supabase after a delay. New data appears once the scrape finishes writing to Supabase.

---

## FastAPI endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET` | `/health` | Load balancer / platform health (`{"status": "ok"}`). |
| `POST` | `/api/meroshare/credentials` | Body: `username`, `password`, `dp_id`. Requires `Authorization: Bearer <access_token>`. |
| `POST` | `/refresh` | Starts scrape for the JWT user in the background. Requires saved credentials. Response: `{"status": "scraper started"}`. |

**CORS:** [`CORS_ALLOW_ORIGINS`](#configuration) (comma-separated). Defaults to local Vite URLs.

---

## Scraper CLI and scheduled runs

- **Shared logic:** **`run_scraper()`** in [`main.py`](main.py). **`main()`** is the CLI entry: **`--user-id`** or **`--all-credential-users`**; **`--no-headless`** optional.
- **GitHub Actions:** set secrets `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ENCRYPTION_KEY`. Workflow runs `python main.py --all-credential-users` on Ubuntu with Chrome/Chromium (see workflow file).

**Prerequisites for any scrape:**

1. SQL: fresh [`DB/main.sql`](DB/main.sql), or run [`DB/migrations/002_scraper_upsert.sql`](DB/migrations/002_scraper_upsert.sql) then [`DB/migrations/003_line_hash_natural_keys.sql`](DB/migrations/003_line_hash_natural_keys.sql) on existing DBs (`line_hash` upsert key; see comments in `main.sql`).
2. `.env` (or host env) with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, **`ENCRYPTION_KEY`**.
3. A **`meroshare_credentials`** row for that user (saved from the dashboard).

```bash
uv run python main.py --user-id 00000000-0000-0000-0000-000000000000
uv run python main.py --user-id 00000000-0000-0000-0000-000000000000 --no-headless   # debug
uv run python main.py --all-credential-users   # every user with meroshare_credentials
```

If MeroShare changes the purchase UI, adjust selectors in `main.py` (e.g. `input[name="script"]`, Search button, tables).

---

## Configuration

```bash
cp .env.example .env
```

| Variable | Description |
| -------- | ----------- |
| `SUPABASE_URL` | Project URL (Python, scraper, server-side Supabase client). |
| `SUPABASE_SERVICE_KEY` | Service role key (keep secret; used by API and scraper). |
| `ENCRYPTION_KEY` | Fernet key for passwords at rest in `meroshare_credentials`. Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `VITE_SUPABASE_URL` | Same project URL for the browser (Vite only exposes `VITE_*`). |
| `VITE_SUPABASE_ANON_KEY` | Anon key for the React app. |
| `VITE_API_BASE_URL` | Optional. Full API origin with scheme, no trailing slash, when the API is not same-origin (production). Omit locally: Vite proxies `/api` and `/refresh`. |
| `CORS_ALLOW_ORIGINS` | Comma-separated origins allowed to call the API. **Unset or blank** falls back to built-in defaults in `api_app.py` (local Vite + production dashboard origin). If you set this on Render, use the exact SPA origin(s) or preflight fails. **`www`** vs apex are different origins. |
| `CHROME_BIN` | Optional. Chromium/Chrome binary path (set automatically in [`Dockerfile`](Dockerfile)). |
| `CHROMEDRIVER_PATH` | Optional. Path to `chromedriver` matching that browser (set in Docker image). |

---

## Local development

**Requirements:** Python 3.10+, [uv](https://docs.astral.sh/uv/) (recommended), [Google Chrome](https://www.google.com/chrome/) for local Selenium (Selenium 4 usually resolves ChromeDriver).

Use a venv named `env/` and point uv at it (see [uv docs](https://docs.astral.sh/uv/)):

```bash
python -m venv env
export UV_PROJECT_ENVIRONMENT=env   # Windows (cmd): set UV_PROJECT_ENVIRONMENT=env
uv sync
```

`uv sync` reads [`pyproject.toml`](pyproject.toml) and [`uv.lock`](uv.lock); commit `uv.lock` for reproducible installs. Optional: `source env/bin/activate` or `uv sync --active`.

**Terminal 1 — API** (repo root, `.env` present):

```bash
uv run uvicorn api_app:app --reload --port 8000
```

**Terminal 2 — frontend:**

```bash
cd web && npm install && npm run dev
```

Vite proxies **`/api`** and **`/refresh`** to `http://127.0.0.1:8000`. Open the printed URL (e.g. `http://localhost:5173`).

**Portfolio math:** **WACC** / **Invested** use a weighted average from purchase **detail** rows when present (BONUS lots as zero NPR in the numerator); otherwise the MeroShare **summary** row. Stock detail adds **Rate (NPR)** by matching purchase lines to buys on date and quantity.

---

## Production API (Docker / Render)

The **[`Dockerfile`](Dockerfile)** installs **Chromium** + **chromium-driver**, installs the Python package, and runs:

`uvicorn api_app:app --host 0.0.0.0 --port $PORT`

**Local smoke test:**

```bash
docker build -t nepse-api .
docker run --rm -p 10000:10000 -e PORT=10000 --env-file .env nepse-api
curl http://localhost:10000/health
```

**Render (Docker Web Service):** connect the repo, choose **Docker**, use **≥ 2 GB RAM** if possible, set the env vars above, health check path **`/health`**. Render provides **`PORT`**. Optional: use root [`render.yaml`](render.yaml) as a Blueprint so `CORS_ALLOW_ORIGINS` and secrets are defined up front (`sync: false` → set values in the Render dashboard).

**CORS on Render:** if **`CORS_ALLOW_ORIGINS`** is missing or **empty** (common with a Blueprint key left blank), the API uses the defaults in [`api_app.py`](api_app.py) (`_DEFAULT_CORS`). To allow extra origins (e.g. Vercel preview URLs), set **`CORS_ALLOW_ORIGINS`** to a comma-separated list. Do not leave the variable defined with an empty value unless you intend to rely on that fallback (after redeploy with the latest `api_app.py`).

**Production frontend:** build the React app with **`VITE_API_BASE_URL`** set to your API URL (no trailing slash), e.g. `https://your-service.onrender.com`, so `Refresh data` calls the right host. See [`web/.env.production.example`](web/.env.production.example).

**Supabase auth URLs (signup confirmation email):** In the [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **URL Configuration**, set **Site URL** to your deployed SPA origin (e.g. `https://your-app.vercel.app`, no trailing path unless you use one). Under **Redirect URLs**, add every origin users may land on after clicking the email link: production SPA, staging/preview URLs, and local dev (`http://localhost:5173`, `http://127.0.0.1:5173`) if you test sign-up locally. The app passes **`emailRedirectTo`** from the browser’s current origin on sign-up ([`web/src/pages/AuthPage.tsx`](web/src/pages/AuthPage.tsx)), so confirmation links redirect to the same host the user registered from; those exact origins must be allow-listed. If **Site URL** stays on localhost, emails will still default there when **`emailRedirectTo`** is not used by older clients—keep **Site URL** aligned with your primary production app.

**Verify CORS after deploy:** replace the origins with yours; the response should include `access-control-allow-origin` matching the `Origin` you send (and status `200` for the preflight):

```bash
curl -sS -o /dev/null -w "health %{http_code}\n" "https://YOUR-API.onrender.com/health"
curl -sS -D - -o /dev/null -X OPTIONS "https://YOUR-API.onrender.com/refresh" \
  -H "Origin: https://YOUR-SPA.example" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization"
```

Then use the dashboard → **Refresh data** and confirm in DevTools **Network** that `POST /refresh` is **200** with `{"status":"scraper started"}` and no CORS errors in the **Console**.

You can run **only** GitHub Actions for scrapes and host a minimal API without Chromium—but then **Refresh data** on that host will not run a real browser unless the API image includes Chrome/Chromium.

---

## Tests and frontend build

```bash
cd web && npm run build && npm test
```

```bash
uv run python -m unittest discover -s tests -v
```
