# nepse-portfolio

Small utility to log into [MeroShare](https://meroshare.cdsc.com.np/) and export **My Transaction History** to a CSV file on disk.

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

| Variable | Description |
|----------|-------------|
| `MEROSHARE_USERNAME` | Your MeroShare login ID |
| `MEROSHARE_PASSWORD` | Your MeroShare password |
| `MEROSHARE_DP` | Depository Participant name (as shown in the DP dropdown on the login page) |

Optional:

| Variable | Description |
|----------|-------------|
| `MEROSHARE_OUT` | Default output path for `--out` (see below) |

## Usage

```bash
uv run python main.py
```

Run with a visible browser (useful for debugging):

```bash
uv run python main.py --no-headless
```

Override output path:

```bash
uv run python main.py --out meroshare/custom_name.csv
```

If `--out` is omitted and `MEROSHARE_OUT` is not set, the file is written to:

`meroshare/<username>_transactions.csv`

where `<username>` is derived from `MEROSHARE_USERNAME` (sanitized for the filesystem). Re-running overwrites that file.

## Output

Exports land under `meroshare/` by default (that directory is gitignored). Each row includes a `scraped_at` timestamp column.

