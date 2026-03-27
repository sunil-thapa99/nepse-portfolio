import argparse
import datetime as dt
import io
import os
import sys
import time
from typing import Dict, List

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from dotenv import load_dotenv

load_dotenv()

# Default MeroShare URL (adjust if needed)
MEROSHARE_URL = "https://meroshare.cdsc.com.np/"
DEFAULT_DP = os.getenv("MEROSHARE_DP")

# Credentials - Update these with your MeroShare credentials
MEROSHARE_USERNAME = os.getenv("MEROSHARE_USERNAME")
MEROSHARE_PASSWORD = os.getenv("MEROSHARE_PASSWORD")


def build_driver(headless: bool = True) -> webdriver.Chrome:
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
    driver = webdriver.Chrome(options=options)
    return driver


def login_meroshare(
    driver: webdriver.Chrome, username: str, password: str, dp_name: str
) -> bool:
    """Login to MeroShare and return True if successful."""
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

        # Navigate to My Transactions page
        try:
            # Wait for navigation to complete, then go to portfolio
            time.sleep(2)
            
            # Try clicking the "My Portfolio" link in the sidebar
            transactions_link = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//a[contains(@href, 'transaction') or contains(., 'My Transaction History')]")
                )
            )
            transactions_link.click()
            time.sleep(3)  # Wait for transactions page to load
            
            # Alternative: navigate directly via URL if clicking doesn't work
            if "transaction" not in driver.current_url.lower():
                driver.get(f"{MEROSHARE_URL}#/transaction")
                time.sleep(3)
        except Exception as e:
            print(f"[warn] Could not navigate to My Transactions page via link, trying direct URL: {e}", file=sys.stderr)
            # Fallback: navigate directly
            driver.get(f"{MEROSHARE_URL}#/transaction")
            time.sleep(3)

        '''
        # Navigate to My Portfolio page
        try:
            # Wait for navigation to complete, then go to portfolio
            time.sleep(2)
            
            # Try clicking the "My Portfolio" link in the sidebar
            portfolio_link = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//a[contains(@href, 'portfolio') or contains(., 'My Portfolio')]")
                )
            )
            portfolio_link.click()
            time.sleep(3)  # Wait for portfolio page to load
            
            # Alternative: navigate directly via URL if clicking doesn't work
            if "portfolio" not in driver.current_url.lower():
                driver.get(f"{MEROSHARE_URL}#/portfolio")
                time.sleep(3)
                
        except Exception as e:
            print(f"[warn] Could not navigate to portfolio page via link, trying direct URL: {e}", file=sys.stderr)
            # Fallback: navigate directly
            driver.get(f"{MEROSHARE_URL}#/portfolio")
            time.sleep(3)
        '''
        return True

    except Exception as e:
        print(f"[error] Login error: {e}", file=sys.stderr)
        return False


def scrape_transactions(driver: webdriver.Chrome) -> List[Dict[str, str]]:
    """Scrape transactions data from MeroShare transactions page."""
    records: List[Dict[str, str]] = []

    try:

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
        WebDriverWait(driver, 20).until(
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


def main():
    parser = argparse.ArgumentParser(
        description="Scrape current holdings from MeroShare"
    )
    parser.add_argument(
        "--out",
        default=os.getenv("MEROSHARE_OUT", "meroshare/holdings.csv"),
        help="Output CSV path",
    )
    parser.add_argument(
        "--dp",
        default=os.getenv("MEROSHARE_DP", DEFAULT_DP),
        help="Depository Participant name",
    )
    parser.add_argument(
        "--username",
        default=MEROSHARE_USERNAME or os.getenv("MEROSHARE_USERNAME"),
        help="MeroShare username (or set MEROSHARE_USERNAME variable in script)",
    )
    parser.add_argument(
        "--password",
        default=MEROSHARE_PASSWORD or os.getenv("MEROSHARE_PASSWORD"),
        help="MeroShare password (or set MEROSHARE_PASSWORD variable in script)",
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Run Chrome in visible mode",
    )

    args = parser.parse_args()

    # Validate credentials
    if not args.username:
        print(
            "[error] Username required. Set MEROSHARE_USERNAME variable in script or use --username",
            file=sys.stderr,
        )
        sys.exit(1)

    if not args.password:
        print(
            "[error] Password required. Set MEROSHARE_PASSWORD variable in script or use --password",
            file=sys.stderr,
        )
        sys.exit(1)

    headless = not args.no_headless
    driver = build_driver(headless=headless)

    try:
        # Login
        print(f"[info] Logging into MeroShare with DP: {args.dp}")
        if not login_meroshare(driver, args.username, args.password, args.dp):
            print("[error] Login failed", file=sys.stderr)
            sys.exit(1)

        print("[info] Login successful, scraping holdings...")

        # Scrape transactions
        records = scrape_transactions(driver)
        if not records:
            print("[warn] No transactions data found", file=sys.stderr)
            sys.exit(1)

        # Save to CSV
        save_transactions_csv(records, args.out)

        '''
        # Scrape holdings
        records = scrape_holdings(driver)
        if not records:
            print("[warn] No holdings data found", file=sys.stderr)
            sys.exit(1)

        # Save to CSV
        save_holdings_csv(records, args.out)
        '''
    finally:
        driver.quit()


if __name__ == "__main__":
    main()

