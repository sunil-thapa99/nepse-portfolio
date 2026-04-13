"""Supabase: fetch credentials, line hashes, upserts for MeroShare scraper."""

from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from meroshare_crypto import decrypt_password
from supabase_client import supabase

logger = logging.getLogger(__name__)

_UPSERT_CHUNK = 500


def _dedupe_upsert_rows(rows: List[Dict[str, Any]], *, label: str) -> List[Dict[str, Any]]:
    """One row per (user_id, line_hash); later rows win. Avoids Postgres ON CONFLICT batch errors."""
    if not rows:
        return []
    by_key: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for r in rows:
        key = (str(r["user_id"]), str(r["line_hash"]))
        by_key[key] = r
    out = list(by_key.values())
    dropped = len(rows) - len(out)
    if dropped:
        logger.warning(
            "[warn] %s upsert: merged %s duplicate row(s) on (user_id, line_hash) "
            "(%s → %s row(s)).",
            label,
            dropped,
            len(rows),
            len(out),
        )
    return out


def fetch_meroshare_credentials(user_id: str) -> Tuple[str, str, str]:
    """Return username, plain password, dp_id (DP name for login dropdown). Raises on missing row."""
    res = (
        supabase.table("meroshare_credentials")
        .select("username,password_encrypted,dp_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise ValueError(f"No meroshare_credentials row for user_id={user_id}")
    row = rows[0]
    pwd = decrypt_password(row["password_encrypted"])
    return (row["username"], pwd, row["dp_id"])


def list_meroshare_credential_user_ids() -> List[str]:
    """Return every user_id that has a meroshare_credentials row (service_role bypasses RLS)."""
    res = supabase.table("meroshare_credentials").select("user_id").execute()
    rows = res.data or []
    return [str(r["user_id"]) for r in rows if r.get("user_id") is not None]


def _norm_tx_field(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and pd.isna(v):
        return ""
    s = str(v).strip()
    if s in ("", "-", "nan", "NaN", "None"):
        return ""
    return s


def _parse_tx_date(rec: Dict[str, str]) -> str:
    raw = (rec.get("Transaction Date") or "").strip()
    if not raw:
        return ""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return pd.to_datetime(raw).date().isoformat()
    except Exception:
        return raw


def _canonical_numeric_for_hash(v: Optional[float]) -> str:
    """Text form of stored numeric for line_hash; aligned with Postgres numeric::text."""
    if v is None:
        return ""
    try:
        d = Decimal(str(v))
    except InvalidOperation:
        return ""
    if d == d.to_integral_value():
        return str(int(d))
    s = format(d, "f").rstrip("0").rstrip(".")
    return s if s else "0"


def transaction_line_hash(user_id: str, rec: Dict[str, str]) -> str:
    """Stable SHA-256 hex; preimage user_id|scrip|date|credit|debit (DB/migrations/003)."""
    scrip = (rec.get("Scrip") or "").strip().upper()
    d = _parse_tx_date(rec)
    cq = _canonical_numeric_for_hash(_parse_num_for_db(rec.get("Credit Quantity")))
    dq = _canonical_numeric_for_hash(_parse_num_for_db(rec.get("Debit Quantity")))
    s = "|".join([user_id, scrip, d, cq, dq])
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _parse_num_for_db(v: Any) -> Optional[float]:
    s = _norm_tx_field(v)
    if s == "":
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def transaction_record_to_row(
    user_id: str,
    rec: Dict[str, str],
    scraped_at_iso: str,
) -> Dict[str, Any]:
    dstr = _parse_tx_date(rec)
    if not dstr:
        raise ValueError("transaction row missing Transaction Date")
    td = date.fromisoformat(dstr)
    return {
        "user_id": user_id,
        "scrip": (rec.get("Scrip") or "").strip(),
        "transaction_date": td.isoformat(),
        "credit_quantity": _parse_num_for_db(rec.get("Credit Quantity")),
        "debit_quantity": _parse_num_for_db(rec.get("Debit Quantity")),
        "balance_after_transaction": _parse_num_for_db(
            rec.get("Balance After Transaction")
        ),
        "history_description": (rec.get("History Description") or "").strip() or None,
        "scraped_at": scraped_at_iso,
        "line_hash": transaction_line_hash(user_id, rec),
    }


def _is_total_row_dict(rec: Dict[str, str]) -> bool:
    return any("total" in str(v).lower() for v in rec.values())


def transactions_records_to_payload(
    user_id: str,
    records: List[Dict[str, str]],
    scraped_at_iso: str,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for rec in records:
        if _is_total_row_dict(rec):
            continue
        scrip = (rec.get("Scrip") or "").strip()
        if not scrip:
            continue
        out.append(transaction_record_to_row(user_id, rec, scraped_at_iso))
    return out


def upsert_transactions(rows: List[Dict[str, Any]]) -> None:
    rows = _dedupe_upsert_rows(rows, label="transactions")
    n = len(rows)
    logger.info("[info] Transactions upsert: starting (%s row(s))...", n)
    for i in range(0, len(rows), _UPSERT_CHUNK):
        chunk = rows[i : i + _UPSERT_CHUNK]
        supabase.table("transactions").upsert(
            chunk,
            on_conflict="user_id,line_hash",
        ).execute()
    logger.info("[info] Transactions upsert: finished (%s row(s)).", n)


def purchase_line_hash(
    user_id: str,
    scrip: str,
    transaction_date_iso: str,
    quantity: float,
) -> str:
    """Stable SHA-256 hex; preimage user_id|scrip|date|quantity (DB/migrations/003)."""
    q = _canonical_numeric_for_hash(quantity)
    s = "|".join(
        [
            user_id,
            scrip.strip().upper(),
            transaction_date_iso,
            q,
        ]
    )
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _parse_purchase_date_raw(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    return _parse_tx_date({"Transaction Date": raw})


def finalized_purchase_rows_to_payload(
    user_id: str,
    finalized: List[Dict[str, str]],
    scraped_at_iso: str,
) -> List[Dict[str, Any]]:
    """Build Supabase rows from finalized purchase dicts (canonical Purchase Source)."""
    out: List[Dict[str, Any]] = []
    for r in finalized:
        scrip = (r.get("Scrip") or "").strip()
        td_raw = (r.get("Transaction Date") or "").strip()
        qty_s = (r.get("Quantity") or "").strip()
        rate_s = (r.get("Rate") or "").strip()
        src = (r.get("Purchase Source") or "").strip()
        if not src:
            src = "ON_MARKET"
        if not scrip or not td_raw:
            continue
        d_iso = _parse_purchase_date_raw(td_raw)
        if not d_iso:
            continue
        td = date.fromisoformat(d_iso)
        qty = _parse_num_for_db(qty_s)
        rate = _parse_num_for_db(rate_s)
        if qty is None:
            continue
        # HTML tables sometimes omit rate; DB requires numeric rate — default to 0.0.
        if rate is None:
            rate = 0.0
        lh = purchase_line_hash(user_id, scrip, td.isoformat(), qty)
        out.append(
            {
                "user_id": user_id,
                "scrip": scrip,
                "transaction_date": td.isoformat(),
                "quantity": qty,
                "rate": rate,
                "purchase_source": src,
                "scraped_at": scraped_at_iso,
                "line_hash": lh,
            }
        )
    return out


def upsert_purchase_sources(rows: List[Dict[str, Any]]) -> None:
    rows = _dedupe_upsert_rows(rows, label="purchase_sources")
    n = len(rows)
    logger.info("[info] Purchase sources upsert: starting (%s row(s))...", n)
    for i in range(0, len(rows), _UPSERT_CHUNK):
        chunk = rows[i : i + _UPSERT_CHUNK]
        supabase.table("purchase_sources").upsert(
            chunk,
            on_conflict="user_id,line_hash",
        ).execute()
    logger.info("[info] Purchase sources upsert: finished (%s row(s)).", n)


def scrip_ltp_line_hash(user_id: str, scrip: str) -> str:
    """Stable SHA-256 hex; preimage user_id|scrip_upper."""
    s = "|".join([user_id, scrip.strip().upper()])
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def scrip_ltp_rows_to_payload(
    user_id: str,
    ltp_rows: List[Dict[str, Any]],
    scraped_at_iso: str,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for row in ltp_rows:
        scrip = str(row.get("Scrip") or "").strip()
        ltp = _parse_num_for_db(row.get("LTP"))
        if not scrip or ltp is None:
            continue
        out.append(
            {
                "user_id": user_id,
                "scrip": scrip,
                "ltp": ltp,
                "scraped_at": scraped_at_iso,
                "line_hash": scrip_ltp_line_hash(user_id, scrip),
            }
        )
    return out


def upsert_scrip_ltp(rows: List[Dict[str, Any]]) -> None:
    rows = _dedupe_upsert_rows(rows, label="scrip_ltp")
    n = len(rows)
    logger.info("[info] Scrip LTP upsert: starting (%s row(s))...", n)
    for i in range(0, len(rows), _UPSERT_CHUNK):
        chunk = rows[i : i + _UPSERT_CHUNK]
        supabase.table("scrip_ltp").upsert(
            chunk,
            on_conflict="user_id,line_hash",
        ).execute()
    logger.info("[info] Scrip LTP upsert: finished (%s row(s)).", n)
