import argparse
import datetime as dt
import io
import os
import re
import shutil
import sys
import tempfile
import time
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

import pandas as pd
from selenium.common.exceptions import TimeoutException
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from dotenv import load_dotenv

from scraper_db import (
    fetch_meroshare_credentials,
    finalized_purchase_rows_to_payload,
    load_transaction_rows_for_open_scrips,
    transactions_records_to_payload,
    upsert_purchase_sources,
    upsert_transactions,
)

load_dotenv()

# Default MeroShare URL (adjust if needed)
MEROSHARE_URL = "https://meroshare.cdsc.com.np/"


def _safe_username_for_filename(username: str) -> str:
    """Filesystem-safe segment from MeroShare username (single output file name)."""
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", username.strip())
    s = re.sub(r"\s+", "_", s)
    return s or "user"


def build_driver(
    headless: bool = True, download_dir: Optional[str] = None
) -> webdriver.Chrome:
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
    )
    if download_dir:
        abs_dir = os.path.abspath(download_dir)
        os.makedirs(abs_dir, exist_ok=True)
        prefs = {
            "download.default_directory": abs_dir,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
        }
        options.add_experimental_option("prefs", prefs)
    driver = webdriver.Chrome(options=options)
    return driver


def _csv_basenames_in_dir(directory: str) -> Set[str]:
    names: Set[str] = set()
    try:
        for name in os.listdir(directory):
            if name.lower().endswith(".csv"):
                names.add(name)
    except FileNotFoundError:
        pass
    return names


def _wait_for_new_csv(
    download_dir: str, before: Set[str], timeout: float = 60
) -> Optional[str]:
    """Wait until Chrome finishes downloading a new .csv (no .crdownload left)."""
    deadline = time.time() + timeout
    abs_dir = os.path.abspath(download_dir)
    while time.time() < deadline:
        try:
            listing = os.listdir(abs_dir)
        except FileNotFoundError:
            time.sleep(0.3)
            continue
        if any(n.endswith(".crdownload") for n in listing):
            time.sleep(0.3)
            continue
        for name in listing:
            if name.lower().endswith(".csv") and name not in before:
                return os.path.join(abs_dir, name)
        time.sleep(0.3)
    return None


def login_meroshare(
    driver: webdriver.Chrome,
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
    driver.get(MEROSHARE_URL)

    try:
        # Wait for login page to load - look for DP dropdown or login form
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, ".select2-selection.select2-selection--single")
            )
        )

        # Select DP (Depository Participant)
        # Click on the select2 dropdown
        dp_dropdown = WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable(
                (By.CSS_SELECTOR, ".select2-selection.select2-selection--single")
            )
        )
        dp_dropdown.click()
        time.sleep(1)

        # Type DP name in search field
        search_field = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".select2-search__field"))
        )
        search_field.clear()
        search_field.send_keys(dp_name)
        time.sleep(1)

        # Wait for results and click the matching option
        option_xpath = f"//li[contains(@class, 'select2-results__option') and contains(text(), '{dp_name}')]"
        option = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, option_xpath))
        )
        option.click()
        time.sleep(1)

        # Fill username
        username_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "username"))
        )
        username_input.clear()
        username_input.send_keys(username)

        # Fill password
        password_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "password"))
        )
        password_input.clear()
        password_input.send_keys(password)

        # Click login button
        login_button = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "button.btn.sign-in[type='submit']"))
        )
        login_button.click()

        # Wait for navigation away from login page (success) or error message (failure)
        time.sleep(3)

        # Check if we're still on login page (login failed)
        time.sleep(2)  # Wait a bit more for navigation
        current_url = driver.current_url
        if "login" in current_url.lower():
            # Check for error messages
            try:
                error_elements = driver.find_elements(
                    By.CSS_SELECTOR, ".error, .alert-danger, [class*='error']"
                )
                if error_elements:
                    error_text = error_elements[0].text
                    print(f"[error] Login failed: {error_text}", file=sys.stderr)
                    return False
            except Exception:
                pass
            print("[error] Login failed: Still on login page", file=sys.stderr)
            return False

        time.sleep(2)
        if after_login == "transaction":
            try:
                transactions_link = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable(
                        (
                            By.XPATH,
                            "//a[contains(@href, 'transaction') or contains(., 'My Transaction History')]",
                        )
                    )
                )
                transactions_link.click()
                time.sleep(3)
                if "transaction" not in driver.current_url.lower():
                    driver.get(f"{MEROSHARE_URL}#/transaction")
                    time.sleep(3)
            except Exception as e:
                print(
                    f"[warn] Could not navigate to My Transactions via link, trying direct URL: {e}",
                    file=sys.stderr,
                )
                driver.get(f"{MEROSHARE_URL}#/transaction")
                time.sleep(3)
        elif after_login == "purchase":
            driver.get(f"{MEROSHARE_URL}#/purchase")
            time.sleep(3)
        return True

    except Exception as e:
        print(f"[error] Login error: {e}", file=sys.stderr)
        return False


def scrape_transactions(
    driver: webdriver.Chrome, download_dir: str
) -> List[Dict[str, str]]:
    """Download transactions CSV (Date filter) and return rows as records."""
    records: List[Dict[str, str]] = []
    abs_download = os.path.abspath(download_dir)
    os.makedirs(abs_download, exist_ok=True)

    try:
        if "transaction" not in driver.current_url.lower():
            driver.get(f"{MEROSHARE_URL}#/transaction")
            time.sleep(3)

        before = _csv_basenames_in_dir(abs_download)

        wait = WebDriverWait(driver, 10)
        wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, ".transaction-radio-btn")
            )
        )
        date_radio = wait.until(
            EC.presence_of_element_located((By.ID, "radio-range"))
        )
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", date_radio)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", date_radio)
        time.sleep(1)

        wait.until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "div.button-grouping")
            )
        )

        try:
            csv_button = wait.until(
                EC.element_to_be_clickable(
                    (
                        By.XPATH,
                        "//div[contains(@class,'button-grouping')]//button[contains(.,'CSV')]",
                    )
                )
            )
        except TimeoutException:
            csv_button = wait.until(
                EC.element_to_be_clickable(
                    (
                        By.XPATH,
                        "//div[contains(@class,'button-grouping')]"
                        "//button[.//i[contains(@class,'msi-download-csv')]]",
                    )
                )
            )
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", csv_button)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", csv_button)
        time.sleep(1)

        downloaded = _wait_for_new_csv(abs_download, before, timeout=90)
        if not downloaded:
            print("[error] Timed out waiting for CSV download", file=sys.stderr)
            return records

        df = pd.read_csv(downloaded)
        try:
            os.remove(downloaded)
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
        print(f"[error] Scraping error: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()

    return records
       
def scrape_holdings(driver: webdriver.Chrome) -> List[Dict[str, str]]:
    """Scrape holdings data from MeroShare portfolio page."""
    records: List[Dict[str, str]] = []

    try:
        # Wait for portfolio table to load
        # Look for table with "My Portfolio" heading or table containing "Scrip" column
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "table"))
        )

        # Find the portfolio table (should contain "Scrip" or "Current Balance" headers)
        tables = driver.find_elements(By.CSS_SELECTOR, "table")
        portfolio_table = None
        
        for table in tables:
            html = table.get_attribute("outerHTML")
            # Check if this table contains portfolio-related headers
            if "Scrip" in html or "Current Balance" in html or "My Portfolio" in html:
                portfolio_table = table
                break
        
        if not portfolio_table:
            # Fallback to first table if we can't find portfolio-specific one
            if tables:
                portfolio_table = tables[0]
            else:
                print("[warn] No tables found on portfolio page", file=sys.stderr)
                return records

        html = portfolio_table.get_attribute("outerHTML")

        # Parse table with pandas using StringIO to avoid deprecation warning
        df_list = pd.read_html(io.StringIO(html))
        if not df_list:
            print("[warn] Could not parse table HTML", file=sys.stderr)
            return records

        df = df_list[0]

        # Clean column names (remove extra whitespace, normalize)
        df.columns = df.columns.str.strip()

        # Convert DataFrame to list of dicts
        for _, row in df.iterrows():
            # Skip total rows
            if "total" in str(row.values).lower():
                continue
                
            record = row.to_dict()
            # Clean up any NaN values and convert to strings
            record = {k: (str(v) if pd.notna(v) else "") for k, v in record.items()}
            records.append(record)

    except Exception as e:
        print(f"[error] Scraping error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()

    return records


def save_holdings_csv(records: List[Dict[str, str]], out_path: str):
    """Save holdings records to CSV."""
    if not records:
        print("[warn] No holdings data to save", file=sys.stderr)
        return

    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)

    df = pd.DataFrame(records)
    ts = dt.datetime.now(dt.timezone.utc).astimezone()
    df.insert(0, "scraped_at", ts.isoformat(timespec="seconds"))

    df.to_csv(out_path, index=False)
    print(f"[info] Saved {len(records)} holdings records to {out_path}")


def save_transactions_csv(records: List[Dict[str, str]], out_path: str):
    """Save transaction records to CSV."""
    if not records:
        print("[warn] No transactions data to save", file=sys.stderr)
        return

    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)

    df = pd.DataFrame(records)
    ts = dt.datetime.now(dt.timezone.utc).astimezone()
    df.insert(0, "scraped_at", ts.isoformat(timespec="seconds"))

    df.to_csv(out_path, index=False)
    print(f"[info] Saved {len(records)} transaction records to {out_path}")


def _tx_csv_balance_series(df: pd.DataFrame) -> pd.Series:
    """Current units per Scrip: last row per symbol after sorting by S.N descending (newest last)."""
    work = df.copy()
    work.columns = work.columns.str.strip()
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


def open_scrips_from_transactions_csv(path: str) -> List[str]:
    """Scrips with current balance > 0 from a MeroShare transaction export CSV."""
    df = pd.read_csv(path)
    bal = _tx_csv_balance_series(df)
    open_syms = bal[bal > 0].index.tolist()
    return sorted(open_syms, key=str.upper)


def open_scrips_from_transaction_records(records: List[Dict[str, str]]) -> List[str]:
    """Same as open_scrips_from_transactions_csv but from in-memory scrape rows."""
    if not records:
        return []
    df = pd.DataFrame(records)
    bal = _tx_csv_balance_series(df)
    open_syms = bal[bal > 0].index.tolist()
    return sorted(open_syms, key=str.upper)


def _find_purchase_script_input(driver: webdriver.Chrome, wait: WebDriverWait):
    """Locate the scrip field on My Purchase Source (name=script or fallbacks)."""
    selectors = [
        (By.CSS_SELECTOR, 'input[name="script"]'),
        (By.NAME, "script"),
        (By.NAME, "scrip"),
        (By.CSS_SELECTOR, 'input[name="scrip"]'),
    ]
    last_err: Optional[Exception] = None
    for by, sel in selectors:
        try:
            el = wait.until(EC.presence_of_element_located((by, sel)))
            if el.is_displayed():
                return el
        except Exception as e:
            last_err = e
            continue
    raise TimeoutException(
        f"Could not find purchase scrip input (tried script/scrip). Last error: {last_err}"
    )


def _clear_purchase_input(driver: webdriver.Chrome, inp) -> None:
    """Clear scrip field; JS + events for SPA frameworks, then Selenium clear."""
    try:
        driver.execute_script(
            "var el=arguments[0]; el.value='';"
            "el.dispatchEvent(new Event('input',{bubbles:true}));"
            "el.dispatchEvent(new Event('change',{bubbles:true}));",
            inp,
        )
    except Exception:
        pass
    try:
        mod = Keys.COMMAND if sys.platform == "darwin" else Keys.CONTROL
        inp.send_keys(mod, "a")
        inp.send_keys(Keys.BACKSPACE)
    except Exception:
        pass
    inp.clear()


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


def _transaction_records_from_csv_path(path: str) -> List[Dict[str, str]]:
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    rows: List[Dict[str, str]] = []
    for _, row in df.iterrows():
        rec = {
            k: (str(v) if pd.notna(v) else "") for k, v in row.items()
        }
        rows.append(rec)
    return rows


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


def _find_purchase_result_tables(driver: webdriver.Chrome, timeout: float = 28.0):
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
            found = driver.find_elements(By.CSS_SELECTOR, sel)
            visible = [t for t in found if t.is_displayed()]
            if visible:
                return visible
        time.sleep(0.4)

    fallback = []
    for t in driver.find_elements(By.TAG_NAME, "table"):
        if not t.is_displayed():
            continue
        rows = t.find_elements(By.CSS_SELECTOR, "tr")
        if len(rows) >= 1:
            fallback.append(t)
    return fallback


def scrape_purchase_sources(
    driver: webdriver.Chrome,
    scrips: List[str],
    *,
    pause_sec: float = 1.5,
) -> List[Dict[str, str]]:
    """For each scrip, search My Purchase Source; each result table maps to canonical purchase rows."""
    all_rows: List[Dict[str, str]] = []
    driver.get(f"{MEROSHARE_URL}#/purchase")
    time.sleep(2.5)
    wait = WebDriverWait(driver, 10)

    try:
        _find_purchase_script_input(driver, wait)
    except Exception as e:
        print(f"[error] Purchase page did not load expected input: {e}", file=sys.stderr)
        return all_rows

    for scrip in scrips:
        sym = str(scrip).strip()
        if not sym:
            continue
        try:
            inp = _find_purchase_script_input(driver, wait)
            _clear_purchase_input(driver, inp)
            time.sleep(0.15)
            inp.send_keys(sym)

            try:
                search_btn = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable(
                        (
                            By.XPATH,
                            "//button[contains(., 'Search') or contains(., 'SEARCH')]",
                        )
                    )
                )
            except TimeoutException:
                search_btn = driver.find_element(
                    By.CSS_SELECTOR,
                    "button.btn[type='submit'], input[type='submit']",
                )
            driver.execute_script(
                "arguments[0].scrollIntoView({block: 'center'});", search_btn
            )
            time.sleep(0.2)
            driver.execute_script("arguments[0].click();", search_btn)
            # Let SPA replace or inject result tables before polling (avoids stale/empty grab).
            time.sleep(0.45)

            tables = _find_purchase_result_tables(driver, timeout=28.0)
            dfs: List[pd.DataFrame] = []
            for table in tables:
                html = table.get_attribute("outerHTML") or ""
                if not html.strip():
                    continue
                try:
                    parsed = pd.read_html(io.StringIO(html))
                except (ValueError, ImportError) as parse_err:
                    print(
                        f"[warn] read_html failed for {sym!r}: {parse_err}",
                        file=sys.stderr,
                    )
                    continue
                if parsed:
                    tdf = parsed[0]
                    tdf.columns = tdf.columns.str.strip()
                    dfs.append(tdf)

            if not dfs:
                print(
                    f"[warn] No parseable purchase tables for scrip {sym!r} "
                    f"(after waiting for table selectors)",
                    file=sys.stderr,
                )
                time.sleep(pause_sec)
                continue

            for tdf in dfs:
                all_rows.extend(_normalize_purchase_table_df(tdf, sym))

        except Exception as e:
            print(
                f"[warn] Purchase source scrape failed for {sym!r}: {e}",
                file=sys.stderr,
            )
        time.sleep(pause_sec)

    return all_rows


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
                "Transaction Date": (r.get("Transaction Date") or "").strip(),
                "Quantity": (r.get("Quantity") or "").strip(),
                "Rate": (r.get("Rate") or "").strip(),
                "Purchase Source": src,
            }
        )
    return finalized, scraped


def save_purchase_sources_csv(
    records: List[Dict[str, str]],
    out_path: str,
    *,
    transaction_records: Optional[List[Dict[str, str]]] = None,
):
    """Save My Purchase Source rows with fixed columns; optional tx backfill for dates."""
    if not records:
        print("[warn] No purchase source rows to save", file=sys.stderr)
        return

    finalized, scraped = finalize_purchase_sources_rows(
        records, transaction_records
    )

    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)
    out_rows = [{"scraped_at": scraped, **r} for r in finalized]
    df = pd.DataFrame(out_rows)
    df.to_csv(out_path, index=False)
    print(f"[info] Saved {len(finalized)} purchase source rows to {out_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Scrape MeroShare transaction history and/or My Purchase Source"
    )
    parser.add_argument(
        "--mode",
        choices=("transactions", "purchase", "both"),
        default="both",
        help=(
            "both (default): login, export My Transaction History CSV, then scrape My Purchase Source "
            "for open scrips; transactions: CSV only; purchase: purchase tables only "
            "(requires --transactions-csv, --scrips, or --user-id)"
        ),
    )
    parser.add_argument(
        "--out",
        default=os.getenv("MEROSHARE_OUT"),
        help="Transactions output CSV (default: meroshare/<username>_transactions.csv)",
    )
    parser.add_argument(
        "--purchase-out",
        default=os.getenv("MEROSHARE_PURCHASE_OUT"),
        help="Purchase source output CSV (default: meroshare/<username>_purchase_sources.csv)",
    )
    parser.add_argument(
        "--transactions-csv",
        default=None,
        help=(
            "Existing transaction export; with --mode purchase, derives open scrips "
            "and fills missing purchase dates (Scrip + Credit Quantity match)"
        ),
    )
    parser.add_argument(
        "--scrips",
        default=None,
        help="Comma-separated scrips (overrides --transactions-csv for --mode purchase)",
    )
    parser.add_argument(
        "--dp",
        default=None,
        help="Depository Participant name (as shown in the DP dropdown on the login page)",
    )
    parser.add_argument(
        "--username",
        default=None,
        help="MeroShare login ID",
    )
    parser.add_argument(
        "--password",
        default=None,
        help="MeroShare password",
    )
    parser.add_argument(
        "--user-id",
        default=None,
        metavar="UUID",
        help=(
            "Supabase auth user id: load MeroShare credentials from meroshare_credentials, "
            "decrypt password (ENCRYPTION_KEY), upsert transactions/purchase_sources (no CSV output)"
        ),
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Run Chrome in visible mode",
    )

    args = parser.parse_args()

    db_mode = bool(args.user_id)
    if db_mode:
        if args.username or args.password or args.dp:
            print(
                "[error] Do not pass --username, --password, or --dp when using --user-id.",
                file=sys.stderr,
            )
            sys.exit(1)
        try:
            username, password, dp = fetch_meroshare_credentials(args.user_id)
        except ValueError as e:
            print(f"[error] {e}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(
                f"[error] Could not load or decrypt credentials (check ENCRYPTION_KEY, Supabase env): {e}",
                file=sys.stderr,
            )
            sys.exit(1)
    else:
        if not args.username:
            print(
                "[error] Username required. Pass --username with your MeroShare login ID, "
                "or use --user-id for database-backed credentials.",
                file=sys.stderr,
            )
            sys.exit(1)

        if not args.password:
            print(
                "[error] Password required. Pass --password with your MeroShare password.",
                file=sys.stderr,
            )
            sys.exit(1)

        if not args.dp:
            print(
                "[error] DP required. Pass --dp with your Depository Participant name "
                "(as shown in the DP dropdown on the login page).",
                file=sys.stderr,
            )
            sys.exit(1)
        username, password, dp = args.username, args.password, args.dp

    if not db_mode:
        safe = _safe_username_for_filename(username)
        if not args.out:
            args.out = f"meroshare/{safe}_transactions.csv"
        if not args.purchase_out:
            args.purchase_out = f"meroshare/{safe}_purchase_sources.csv"
    else:
        if not args.out:
            args.out = None
        if not args.purchase_out:
            args.purchase_out = None

    out_path = os.path.abspath(args.out) if args.out else ""
    purchase_out_path = os.path.abspath(args.purchase_out) if args.purchase_out else ""
    headless = not args.no_headless

    tx_for_purchase_fill: Optional[List[Dict[str, str]]] = None

    if args.mode == "purchase":
        tx_for_purchase_fill = None
        if args.transactions_csv:
            csv_fill = os.path.abspath(args.transactions_csv)
            if os.path.isfile(csv_fill):
                tx_for_purchase_fill = _transaction_records_from_csv_path(csv_fill)
        elif args.user_id:
            tx_for_purchase_fill = load_transaction_rows_for_open_scrips(args.user_id)

        scrip_list: List[str] = []
        if args.scrips:
            scrip_list = [s.strip() for s in args.scrips.split(",") if s.strip()]
        elif args.transactions_csv:
            csv_path = os.path.abspath(args.transactions_csv)
            if not os.path.isfile(csv_path):
                print(f"[error] File not found: {csv_path}", file=sys.stderr)
                sys.exit(1)
            scrip_list = open_scrips_from_transactions_csv(csv_path)
        elif args.user_id:
            scrip_list = open_scrips_from_transaction_records(
                tx_for_purchase_fill or []
            )
        else:
            print(
                "[error] --mode purchase requires --scrips, --transactions-csv, or --user-id",
                file=sys.stderr,
            )
            sys.exit(1)
        if not scrip_list:
            print("[error] No open scrips to query (empty list).", file=sys.stderr)
            sys.exit(1)

    tmp_download = tempfile.mkdtemp(prefix="meroshare_csv_")
    driver = build_driver(headless=headless, download_dir=tmp_download)

    try:
        print(f"[info] Logging into MeroShare with DP: {dp}")
        scraped_at = (
            dt.datetime.now(dt.timezone.utc)
            .astimezone()
            .isoformat(timespec="seconds")
        )
        uid = args.user_id

        if args.mode == "transactions":
            if not login_meroshare(
                driver, username, password, dp, after_login="transaction"
            ):
                print("[error] Login failed", file=sys.stderr)
                sys.exit(1)
            print("[info] Login successful, scraping transactions...")
            records = scrape_transactions(driver, tmp_download)
            if not records:
                print("[warn] No transactions data found", file=sys.stderr)
                sys.exit(1)
            if db_mode and uid:
                tx_payload = transactions_records_to_payload(
                    uid, records, scraped_at
                )
                upsert_transactions(tx_payload)
                print(
                    f"[info] Upserted {len(tx_payload)} transaction row(s) to Supabase"
                )
            else:
                save_transactions_csv(records, out_path)

        elif args.mode == "purchase":
            if not login_meroshare(
                driver, username, password, dp, after_login="purchase"
            ):
                print("[error] Login failed", file=sys.stderr)
                sys.exit(1)
            print(
                f"[info] Login successful, scraping purchase source for {len(scrip_list)} scrip(s)..."
            )
            purchase_rows = scrape_purchase_sources(driver, scrip_list)
            if not purchase_rows:
                print("[warn] No purchase source rows collected", file=sys.stderr)
                sys.exit(1)
            if db_mode and uid:
                fin, _ = finalize_purchase_sources_rows(
                    purchase_rows, tx_for_purchase_fill
                )
                upsert_purchase_sources(
                    finalized_purchase_rows_to_payload(uid, fin, scraped_at)
                )
                print(
                    f"[info] Upserted {len(fin)} purchase source row(s) to Supabase"
                )
            else:
                save_purchase_sources_csv(
                    purchase_rows,
                    purchase_out_path,
                    transaction_records=tx_for_purchase_fill,
                )

        else:
            if not login_meroshare(
                driver, username, password, dp, after_login="transaction"
            ):
                print("[error] Login failed", file=sys.stderr)
                sys.exit(1)
            print("[info] Login successful, scraping transactions...")
            records = scrape_transactions(driver, tmp_download)
            if not records:
                print("[warn] No transactions data found", file=sys.stderr)
                sys.exit(1)
            if db_mode and uid:
                tx_payload = transactions_records_to_payload(
                    uid, records, scraped_at
                )
                upsert_transactions(tx_payload)
                print(
                    f"[info] Upserted {len(tx_payload)} transaction row(s) to Supabase"
                )
            else:
                save_transactions_csv(records, out_path)

            open_syms = open_scrips_from_transaction_records(records)
            if not open_syms:
                print(
                    "[warn] No open positions in transaction data; skipping purchase source",
                    file=sys.stderr,
                )
            else:
                print(
                    f"[info] Scraping purchase source for {len(open_syms)} open scrip(s)..."
                )
                purchase_rows = scrape_purchase_sources(driver, open_syms)
                if purchase_rows:
                    if db_mode and uid:
                        fin, _ = finalize_purchase_sources_rows(
                            purchase_rows, records
                        )
                        upsert_purchase_sources(
                            finalized_purchase_rows_to_payload(
                                uid, fin, scraped_at
                            )
                        )
                        print(
                            f"[info] Upserted {len(fin)} purchase source row(s) to Supabase"
                        )
                    else:
                        save_purchase_sources_csv(
                            purchase_rows,
                            purchase_out_path,
                            transaction_records=records,
                        )
                else:
                    print(
                        "[warn] No purchase source rows collected",
                        file=sys.stderr,
                    )

    finally:
        driver.quit()
        shutil.rmtree(tmp_download, ignore_errors=True)


if __name__ == "__main__":
    main()

