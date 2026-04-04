import argparse
import asyncio
import datetime as dt
import io
import logging
import os
import shutil
import sys
import tempfile
import time
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd
from dotenv import load_dotenv
from playwright.async_api import Page, TimeoutError as PWTimeoutError, async_playwright

from scraper_db import (
    fetch_meroshare_credentials,
    finalized_purchase_rows_to_payload,
    list_meroshare_credential_user_ids,
    transactions_records_to_payload,
    upsert_purchase_sources,
    upsert_transactions,
)

load_dotenv()

logger = logging.getLogger(__name__)

# Default MeroShare URL (adjust if needed)
MEROSHARE_URL = "https://meroshare.cdsc.com.np/"

MEROSHARE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
)


async def login_meroshare(
    page: Page,
    username: str,
    password: str,
    dp_name: str,
    *,
    after_login: str = "transaction",
) -> bool:
    """Login to MeroShare and return True if successful.

    after_login:
        "transaction" — open My Transaction History (default).
        "purchase" — open My Purchase Source (#/purchase).
        "dashboard" — stay on post-login home (no extra navigation).
    """
    # SPA: "domcontentloaded" is often too early; "load" + attached-state waits
    # match Selenium's presence_of_element_located (DOM present, not necessarily visible yet).
    await page.goto(MEROSHARE_URL, wait_until="load", timeout=60_000)
    await asyncio.sleep(2)

    try:
        await page.wait_for_selector(".select2-selection.select2-selection--single", timeout=20000)

        await page.click(".select2-selection.select2-selection--single")
        await page.wait_for_timeout(1000)
        # dp_dropdown = page.locator(".select2-selection.select2-selection--single").first
        # await dp_dropdown.scroll_into_view_if_needed()
        # await asyncio.sleep(0.5)
        # try:
        #     await dp_dropdown.click(timeout=15_000)
        # except PWTimeoutError:
        #     await dp_dropdown.evaluate("el => el.click()")
        # await asyncio.sleep(1)

        search_field = page.locator(".select2-search__field")
        await search_field.wait_for(state="visible", timeout=10_000)
        await search_field.fill("")
        await search_field.fill(dp_name)
        await asyncio.sleep(1)

        option_xpath = (
            f"//li[contains(@class, 'select2-results__option') "
            f"and contains(text(), '{dp_name}')]"
        )
        option = page.locator(f"xpath={option_xpath}")
        await option.wait_for(state="visible", timeout=10_000)
        await option.click()
        await asyncio.sleep(1)

        username_input = page.locator("#username")
        await username_input.wait_for(state="visible", timeout=10_000)
        await username_input.fill("")
        await username_input.fill(username)

        password_input = page.locator("#password")
        await password_input.wait_for(state="visible", timeout=10_000)
        await password_input.fill("")
        await password_input.fill(password)

        login_button = page.locator("button.btn.sign-in[type='submit']")
        await login_button.wait_for(state="visible", timeout=10_000)
        await login_button.click()

        await asyncio.sleep(3)
        await asyncio.sleep(2)
        current_url = page.url
        if "login" in current_url.lower():
            try:
                errs = page.locator(".error, .alert-danger, [class*='error']")
                if await errs.count() > 0:
                    error_text = (await errs.first.inner_text()).strip()
                    logger.error("[error] Login failed: %s", error_text)
                    return False
            except Exception:
                pass
            logger.error("[error] Login failed: Still on login page")
            return False

        await asyncio.sleep(2)
        if after_login == "transaction":
            try:
                tx_link = page.locator(
                    "xpath=//a[contains(@href, 'transaction') or "
                    "contains(., 'My Transaction History')]"
                )
                await tx_link.wait_for(state="visible", timeout=10_000)
                await tx_link.click()
                await asyncio.sleep(3)
                if "transaction" not in page.url.lower():
                    await page.goto(f"{MEROSHARE_URL}#/transaction", wait_until="domcontentloaded")
                    await asyncio.sleep(3)
            except Exception as e:
                logger.warning(
                    "[warn] Could not navigate to My Transactions via link, trying direct URL: %s",
                    e,
                )
                await page.goto(f"{MEROSHARE_URL}#/transaction", wait_until="domcontentloaded")
                await asyncio.sleep(3)
        elif after_login == "purchase":
            await page.goto(f"{MEROSHARE_URL}#/purchase", wait_until="domcontentloaded")
            await asyncio.sleep(3)
        return True

    except Exception as e:
        logger.error("[error] Login error: %s", e)
        return False


async def scrape_transactions(
    page: Page, download_dir: str
) -> List[Dict[str, str]]:
    """Download transactions CSV (Date filter) and return rows as records."""
    records: List[Dict[str, str]] = []
    abs_download = os.path.abspath(download_dir)
    os.makedirs(abs_download, exist_ok=True)

    try:
        if "transaction" not in page.url.lower():
            await page.goto(f"{MEROSHARE_URL}#/transaction", wait_until="domcontentloaded")
            await asyncio.sleep(3)

        await page.wait_for_selector(".transaction-radio-btn", timeout=10_000)
        date_radio = page.locator("#radio-range")
        await date_radio.wait_for(state="attached", timeout=10_000)
        await date_radio.evaluate("el => el.scrollIntoView({block: 'center'})")
        await asyncio.sleep(0.3)
        await date_radio.evaluate("el => el.click()")
        await asyncio.sleep(1)

        await page.wait_for_selector("div.button-grouping", timeout=10_000)

        try:
            csv_button = page.locator(
                "xpath=//div[contains(@class,'button-grouping')]"
                "//button[contains(.,'CSV')]"
            ).first
            await csv_button.wait_for(state="visible", timeout=10_000)
        except PWTimeoutError:
            csv_button = page.locator(
                "xpath=//div[contains(@class,'button-grouping')]"
                "//button[.//i[contains(@class,'msi-download-csv')]]"
            ).first
            await csv_button.wait_for(state="visible", timeout=10_000)

        await csv_button.evaluate("el => el.scrollIntoView({block: 'center'})")
        await asyncio.sleep(0.3)

        async with page.expect_download(timeout=90_000) as download_info:
            await csv_button.evaluate("el => el.click()")
        download = await download_info.value
        suggested = download.suggested_filename
        if not suggested or not suggested.lower().endswith(".csv"):
            suggested = "meroshare_transactions.csv"
        dest = os.path.join(abs_download, suggested)
        await download.save_as(dest)

        df = pd.read_csv(dest)
        try:
            os.remove(dest)
        except OSError:
            pass
        df.columns = df.columns.str.strip()

        for _, row in df.iterrows():
            if "total" in str(row.values).lower():
                continue
            record = row.to_dict()
            record = {k: (str(v) if pd.notna(v) else "") for k, v in record.items()}
            records.append(record)

    except Exception as e:
        logger.exception("[error] Scraping error: %s", e)

    return records


def _tx_csv_balance_series(df: pd.DataFrame) -> pd.Series:
    """Current units per Scrip: last row per symbol after sorting by S.N descending (newest last)."""
    work = df.copy()
    work.columns = work.columns.str.strip()
    # MeroShare sometimes exports "S.N." instead of "S.N".
    if "S.N" not in work.columns and "S.N." in work.columns:
        work = work.rename(columns={"S.N.": "S.N"})
    if "Scrip" not in work.columns or "S.N" not in work.columns:
        return pd.Series(dtype=float)
    mask = ~work.apply(
        lambda r: "total" in str(r.values).lower(), axis=1
    )
    work = work.loc[mask].copy()
    work["_sn"] = pd.to_numeric(work["S.N"], errors="coerce")
    work = work.dropna(subset=["_sn"])
    work["Scrip"] = work["Scrip"].astype(str).str.strip()
    work = work[work["Scrip"] != ""]
    work = work.sort_values("_sn", ascending=False)
    bal_col = "Balance After Transaction"
    if bal_col not in work.columns:
        return pd.Series(dtype=float)

    def _bal(v: object) -> float:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return 0.0
        s = str(v).strip()
        if s in ("", "-", "nan"):
            return 0.0
        try:
            return float(s.replace(",", ""))
        except ValueError:
            return 0.0

    work["_bal"] = work[bal_col].map(_bal)
    last = work.groupby("Scrip", sort=False).last()
    return last["_bal"]


def open_scrips_from_transaction_records(records: List[Dict[str, str]]) -> List[str]:
    """Scrips with balance > 0 from in-memory transaction rows (same logic as MeroShare export)."""
    if not records:
        return []
    df = pd.DataFrame(records)
    bal = _tx_csv_balance_series(df)
    open_syms = bal[bal > 0].index.tolist()
    return sorted(open_syms, key=str.upper)


async def _find_purchase_script_input(page: Page):
    """Locate the scrip field on My Purchase Source (name=script or fallbacks)."""
    selectors = [
        'input[name="script"]',
        '[name="script"]',
        '[name="scrip"]',
        'input[name="scrip"]',
    ]
    last_err: Optional[Exception] = None
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            await loc.wait_for(state="visible", timeout=10_000)
            if await loc.is_visible():
                return loc
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(
        f"Could not find purchase scrip input (tried script/scrip). Last error: {last_err}"
    )


async def _clear_purchase_input(loc) -> None:
    """Clear scrip field; JS + events for SPA frameworks, then keyboard clear."""
    try:
        await loc.evaluate(
            """el => {
            el.value='';
            el.dispatchEvent(new Event('input',{bubbles:true}));
            el.dispatchEvent(new Event('change',{bubbles:true}));
        }"""
        )
    except Exception:
        pass
    try:
        await loc.click()
        mod = "Meta" if sys.platform == "darwin" else "Control"
        await loc.press(f"{mod}+A")
        await loc.press("Backspace")
    except Exception:
        pass
    await loc.fill("")


async def _find_purchase_result_tables(page: Page, timeout: float = 28.0):
    """
    Wait for result tables after Search. Results often load asynchronously; a short
    fixed sleep misses them. Try Bootstrap table class variants, then any visible
    <table> with rows.
    """
    selectors = [
        "table.table",
        "table.table-striped",
        "table.table-bordered",
        "table.table-hover",
        "table.table-sm",
        ".table-responsive table",
        "div.table-responsive table",
    ]
    deadline = time.time() + timeout
    while time.time() < deadline:
        for sel in selectors:
            loc = page.locator(sel)
            n = await loc.count()
            visible = []
            for i in range(n):
                item = loc.nth(i)
                if await item.is_visible():
                    visible.append(item)
            if visible:
                return visible
        await asyncio.sleep(0.4)

    fallback = []
    tables = page.locator("table")
    n = await tables.count()
    for i in range(n):
        t = tables.nth(i)
        if not await t.is_visible():
            continue
        rows = t.locator("tr")
        if await rows.count() >= 1:
            fallback.append(t)
    return fallback


async def scrape_purchase_sources(
    page: Page,
    scrips: List[str],
    *,
    pause_sec: float = 1.5,
) -> List[Dict[str, str]]:
    """For each scrip, search My Purchase Source; each result table maps to canonical purchase rows."""
    all_rows: List[Dict[str, str]] = []
    await page.goto(f"{MEROSHARE_URL}#/purchase", wait_until="domcontentloaded")
    await asyncio.sleep(2.5)

    try:
        await _find_purchase_script_input(page)
    except Exception as e:
        logger.error("[error] Purchase page did not load expected input: %s", e)
        return all_rows

    to_scrape = [str(s).strip() for s in scrips if str(s).strip()]
    for i, sym in enumerate(to_scrape, start=1):
        logger.info(
            "[info] Scraping purchase source for scrip %s/%s: %s",
            i,
            len(to_scrape),
            sym,
        )
        try:
            inp = await _find_purchase_script_input(page)
            await _clear_purchase_input(inp)
            await asyncio.sleep(0.15)
            await inp.fill(sym)

            try:
                search_btn = page.locator(
                    "xpath=//button[contains(., 'Search') or contains(., 'SEARCH')]"
                ).first
                await search_btn.wait_for(state="visible", timeout=10_000)
            except PWTimeoutError:
                search_btn = page.locator(
                    "button.btn[type='submit'], input[type='submit']"
                ).first
                await search_btn.wait_for(state="visible", timeout=10_000)

            await search_btn.evaluate("el => el.scrollIntoView({block: 'center'})")
            await asyncio.sleep(0.2)
            await search_btn.evaluate("el => el.click()")
            await asyncio.sleep(0.45)

            tables = await _find_purchase_result_tables(page, timeout=28.0)
            dfs: List[pd.DataFrame] = []
            for table in tables:
                html = await table.evaluate("el => el.outerHTML") or ""
                if not html.strip():
                    continue
                try:
                    parsed = pd.read_html(io.StringIO(html))
                except (ValueError, ImportError) as parse_err:
                    logger.warning(
                        "[warn] read_html failed for %r: %s", sym, parse_err
                    )
                    continue
                if parsed:
                    tdf = parsed[0]
                    tdf.columns = tdf.columns.str.strip()
                    dfs.append(tdf)

            if not dfs:
                logger.warning(
                    "[warn] No parseable purchase tables for scrip %r "
                    "(after waiting for table selectors)",
                    sym,
                )
                await asyncio.sleep(pause_sec)
                continue
            for tdf in dfs:
                all_rows.extend(_normalize_purchase_table_df(tdf, sym))

        except Exception as e:
            logger.warning(
                "[warn] Purchase source scrape failed for %r: %s", sym, e
            )
        await asyncio.sleep(pause_sec)
    return all_rows


def _purchase_col_index(df: pd.DataFrame) -> Dict[str, str]:
    """Lowercase stripped header -> original column name."""
    return {str(c).strip().lower(): c for c in df.columns}


def _purchase_pick_col(cmap: Dict[str, str], *candidates: str) -> Optional[str]:
    for name in candidates:
        key = name.strip().lower()
        if key in cmap:
            return cmap[key]
    return None


def _purchase_cell_str(row: pd.Series, col: Optional[str]) -> str:
    if col is None or col not in row.index:
        return ""
    v = row[col]
    if pd.isna(v):
        return ""
    s = str(v).strip()
    if s.lower() == "nan":
        return ""
    return s


def _purchase_parse_float(val: object) -> Optional[float]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if s in ("", "-", "nan"):
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def _purchase_format_quantity(q: float) -> str:
    if abs(q - round(q)) < 1e-9:
        return str(int(round(q)))
    t = f"{q:.10f}".rstrip("0").rstrip(".")
    return t if t else "0"


def _purchase_format_rate(r: float) -> str:
    return _purchase_format_quantity(r)


def _canonical_purchase_source(raw: str) -> str:
    t = (raw or "").strip()
    if not t:
        return "ON_MARKET"
    return t.upper().replace("-", "_")


def _normalize_purchase_table_df(
    df: pd.DataFrame, query_scrip: str
) -> List[Dict[str, str]]:
    """
    Map one parsed HTML table to canonical purchase fields (no wide concat).
    """
    df = df.copy()
    df.columns = df.columns.str.strip()
    cmap = _purchase_col_index(df)

    scrip_col = _purchase_pick_col(cmap, "scrip")
    date_col = _purchase_pick_col(cmap, "transaction date")
    qty_tq = _purchase_pick_col(cmap, "transaction quantity")
    qty_generic = _purchase_pick_col(cmap, "quantity")
    qty_wacc = _purchase_pick_col(cmap, "wacc calculated quantity")
    rate_detail = _purchase_pick_col(cmap, "rate")
    rate_wacc = _purchase_pick_col(cmap, "wacc rate")
    src_col = _purchase_pick_col(cmap, "purchase source")

    qty_candidates = [
        c
        for c in (qty_tq, qty_wacc, qty_generic)
        if c is not None
    ]
    seen: Set[str] = set()
    qty_cols_ordered: List[str] = []
    for c in qty_candidates:
        if c not in seen:
            seen.add(c)
            qty_cols_ordered.append(c)

    out: List[Dict[str, str]] = []
    sym = str(query_scrip).strip()

    for _, row in df.iterrows():
        if "total" in str(row.values).lower():
            continue

        scrip = _purchase_cell_str(row, scrip_col) or sym
        tx_date = _purchase_cell_str(row, date_col)

        qty_raw: Optional[float] = None
        for qc in qty_cols_ordered:
            q = _purchase_parse_float(row[qc])
            if q is not None and q > 0:
                qty_raw = q
                break
        if qty_raw is None or qty_raw <= 0:
            continue

        rate_s = ""
        r: Optional[float] = None
        if rate_detail is not None:
            r = _purchase_parse_float(row[rate_detail])
        if r is None and rate_wacc is not None:
            r = _purchase_parse_float(row[rate_wacc])
        if r is not None:
            rate_s = _purchase_format_rate(r)

        src = _canonical_purchase_source(_purchase_cell_str(row, src_col))

        out.append(
            {
                "Scrip": scrip,
                "Transaction Date": tx_date,
                "Quantity": _purchase_format_quantity(qty_raw),
                "Rate": rate_s,
                "Purchase Source": src,
            }
        )

    return out


def _purchase_tx_date_index(
    tx_records: List[Dict[str, str]],
) -> Dict[Tuple[str, str], List[str]]:
    """
    Map (scrip_upper, quantity_str) -> transaction dates (Credit Quantity match).
    quantity_str normalized like _purchase_format_quantity for lookup.
    """
    idx: Dict[Tuple[str, str], List[str]] = defaultdict(list)
    for rec in tx_records:
        scrip = str(rec.get("Scrip", "")).strip()
        if not scrip:
            continue
        cq = _purchase_parse_float(rec.get("Credit Quantity", ""))
        if cq is None or cq <= 0:
            continue
        date = str(rec.get("Transaction Date", "")).strip()
        if not date:
            continue
        qkey = _purchase_format_quantity(cq)
        idx[(scrip.upper(), qkey)].append(date)
    return {k: sorted(set(v)) for k, v in idx.items()}


def _purchase_fill_dates_from_transactions(
    purchase_rows: List[Dict[str, str]],
    tx_records: Optional[List[Dict[str, str]]],
) -> None:
    if not tx_records:
        return
    index = _purchase_tx_date_index(tx_records)
    for rec in purchase_rows:
        d = (rec.get("Transaction Date") or "").strip()
        if d:
            continue
        scrip = (rec.get("Scrip") or "").strip()
        qty = (rec.get("Quantity") or "").strip()
        if not scrip or not qty:
            continue
        qf = _purchase_parse_float(qty)
        if qf is None or qf <= 0:
            continue
        qkey = _purchase_format_quantity(qf)
        dates = index.get((scrip.upper(), qkey))
        if not dates:
            continue
        rec["Transaction Date"] = dates[0]


def finalize_purchase_sources_rows(
    records: List[Dict[str, str]],
    transaction_records: Optional[List[Dict[str, str]]],
) -> Tuple[List[Dict[str, str]], str]:
    """Canonical purchase rows (no scraped_at column) and scrape timestamp ISO string."""
    rows = [dict(r) for r in records]
    _purchase_fill_dates_from_transactions(rows, transaction_records)
    ts = dt.datetime.now(dt.timezone.utc).astimezone()
    scraped = ts.isoformat(timespec="seconds")
    finalized: List[Dict[str, str]] = []
    for r in rows:
        src = _canonical_purchase_source(r.get("Purchase Source", ""))
        finalized.append(
            {
                "Scrip": (r.get("Scrip") or "").strip(),
                "Transaction Date": (r.get("Transaction Date") or dt.date.today().isoformat()).strip(),
                "Quantity": (r.get("Quantity") or "").strip(),
                "Rate": (r.get("Rate") or "").strip(),
                "Purchase Source": src,
            }
        )
    return finalized, scraped


class ScraperError(Exception):
    """Raised when the MeroShare scrape cannot complete successfully."""


async def async_run_scraper(user_id: str, *, headless: bool = True) -> None:
    """
    Load credentials for user_id, run Playwright scrape, upsert transactions and purchase_sources.
    Raises ScraperError on expected failures; may propagate other exceptions from I/O or Playwright.
    """
    try:
        username, password, dp = fetch_meroshare_credentials(user_id)
    except ValueError as e:
        raise ScraperError(str(e)) from e
    except Exception as e:
        raise ScraperError(
            "Could not load or decrypt credentials (check ENCRYPTION_KEY, Supabase env): "
            f"{e}"
        ) from e

    tmp_download = tempfile.mkdtemp(prefix="meroshare_tx_dl_")
    os.makedirs(os.path.abspath(tmp_download), exist_ok=True)
    try:
        async with async_playwright() as p:
            launch_kwargs = {
                "headless": headless,
                "args": ["--no-sandbox", "--disable-dev-shm-usage"],
            }
            chrome_bin = os.environ.get("CHROME_BIN", "").strip()
            if chrome_bin:
                launch_kwargs["executable_path"] = chrome_bin

            browser = await p.chromium.launch(**launch_kwargs)
            context = await browser.new_context(
                accept_downloads=True,
                user_agent=MEROSHARE_USER_AGENT,
                viewport={"width": 1200, "height": 1200},
                ignore_https_errors=True,
            )
            page = await context.new_page()
            try:
                logger.info("[info] Logging into MeroShare with DP: %s", dp)
                scraped_at = (
                    dt.datetime.now(dt.timezone.utc)
                    .astimezone()
                    .isoformat(timespec="seconds")
                )
                uid = user_id

                if not await login_meroshare(
                    page, username, password, dp, after_login="transaction"
                ):
                    raise ScraperError("Login failed")
                logger.info("[info] Login successful, scraping transactions...")
                records = await scrape_transactions(page, tmp_download)
                if not records:
                    raise ScraperError("No transactions data found")
                logger.info(
                    "[info] Transactions: scraped %s row(s) from MeroShare",
                    len(records),
                )
                tx_payload = transactions_records_to_payload(
                    uid, records, scraped_at
                )
                logger.info(
                    "[info] Transactions: %s row(s) in DB payload "
                    "(after filtering totals/empty scrip)",
                    len(tx_payload),
                )
                upsert_transactions(tx_payload)

                purchase_rows = None
                ps_payload = None
                open_syms = open_scrips_from_transaction_records(records)
                if not open_syms:
                    logger.warning(
                        "[warn] No open positions in transaction data; "
                        "skipping purchase source"
                    )
                else:
                    logger.info(
                        "[info] Scraping purchase source for %s open scrip(s)...",
                        len(open_syms),
                    )
                    purchase_rows = await scrape_purchase_sources(page, open_syms)
                    logger.info(
                        "[info] Purchase sources: scraped %s row(s) from MeroShare",
                        len(purchase_rows),
                    )
                    if purchase_rows:
                        fin, _ = finalize_purchase_sources_rows(
                            purchase_rows, records
                        )
                        ps_payload = finalized_purchase_rows_to_payload(
                            uid, fin, scraped_at
                        )
                        logger.info(
                            "[info] Purchase sources: finalized %s row(s), "
                            "DB payload %s row(s)",
                            len(fin),
                            len(ps_payload),
                        )
                        if len(fin) > 0 and len(ps_payload) == 0:
                            logger.warning(
                                "[warn] Purchase rows were finalized but none matched "
                                "the DB payload (check transaction dates, quantity, and rate)."
                            )
                        upsert_purchase_sources(ps_payload)
                    else:
                        logger.warning("[warn] No purchase source rows collected")

                summary = (
                    f"[info] Scrape summary: transactions {len(records)} scraped → "
                    f"{len(tx_payload)} upserted"
                )
                if open_syms:
                    pr = len(purchase_rows) if purchase_rows is not None else 0
                    pu = len(ps_payload) if ps_payload is not None else 0
                    summary += f"; purchase {pr} scraped → {pu} upserted"
                logger.info("%s", summary)
            finally:
                await browser.close()
    finally:
        shutil.rmtree(tmp_download, ignore_errors=True)


def run_scraper(user_id: str, *, headless: bool = True) -> None:
    asyncio.run(async_run_scraper(user_id, headless=headless))


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Scrape MeroShare and upsert into Supabase: export transaction history in-browser, "
            "upsert transactions, then scrape My Purchase Source for open scrips. "
            "Pass --user-id or --all-credential-users. Purchase rows come from HTML tables."
        )
    )
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument(
        "--user-id",
        metavar="UUID",
        help=(
            "Supabase auth user id: load MeroShare credentials from meroshare_credentials, "
            "decrypt password (ENCRYPTION_KEY), upsert transactions and purchase_sources"
        ),
    )
    scope.add_argument(
        "--all-credential-users",
        action="store_true",
        help="Run the scraper once for each user_id in meroshare_credentials",
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Run Chrome in visible mode",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        stream=sys.stderr,
        force=True,
    )

    headless = not args.no_headless

    if args.all_credential_users:
        user_ids = list_meroshare_credential_user_ids()
        if not user_ids:
            logger.info(
                "[info] No rows in meroshare_credentials; nothing to scrape (exit 0)"
            )
            return
        failed = 0
        for uid in user_ids:
            logger.info("[info] Starting scrape for user_id=%s", uid)
            try:
                run_scraper(uid, headless=headless)
            except ScraperError as e:
                logger.error("[error] user_id=%s: %s", uid, e)
                failed += 1
            except Exception as e:
                logger.exception("[error] user_id=%s: %s", uid, e)
                failed += 1
        if failed:
            logger.error(
                "[error] Batch finished with %s failure(s) out of %s user(s)",
                failed,
                len(user_ids),
            )
            sys.exit(1)
        return

    try:
        run_scraper(args.user_id, headless=headless)
    except ScraperError as e:
        logger.error("[error] %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
