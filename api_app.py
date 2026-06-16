"""FastAPI app: POST /api/meroshare/credentials, POST /refresh (background scraper)."""

import datetime as dt
import logging
import os

import httpx
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from postgrest.exceptions import APIError

load_dotenv()

from main import ScraperError, run_asba_apply, run_scraper
from supabase_client import supabase

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

_DEFAULT_CORS = "http://localhost:5173,http://127.0.0.1:5173,https://nepse-portfolio-rosy.vercel.app"


def _cors_allow_origins() -> list[str]:
    # Render/hosts often define CORS_ALLOW_ORIGINS as "" (Blueprint placeholder).
    # get(..., default) still returns "", which yields an empty allow list and breaks preflight.
    raw = os.environ.get("CORS_ALLOW_ORIGINS")
    if raw is None or not str(raw).strip():
        raw = _DEFAULT_CORS
    return [o.strip() for o in raw.split(",") if o.strip()]


def _fernet() -> Fernet:
    key = os.environ["ENCRYPTION_KEY"].strip().encode("utf-8")
    return Fernet(key)


def verify_jwt_user_id(jwt: str) -> str:
    url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/user"
    with httpx.Client(timeout=15.0) as client:
        r = client.get(
            url,
            headers={
                "Authorization": f"Bearer {jwt}",
                "apikey": SUPABASE_SERVICE_KEY,
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    data = r.json()
    uid = data.get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return uid


def _format_postgrest_error(e: APIError) -> str:
    parts = [
        p
        for p in (e.message, e.details, e.hint, f"code {e.code}" if e.code else "")
        if p
    ]
    return " ".join(parts).strip() or "Supabase request failed"


def _utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def create_scrape_job(user_id: str) -> str:
    """Create a realtime-visible scrape job row using the service-role client."""
    payload = {
        "user_id": user_id,
        "status": "running",
        "progress": 5,
        "message": "Starting scraper",
        "completed": False,
        "failed": False,
        "error_message": None,
        "started_at": _utc_now_iso(),
    }
    res = supabase.table("scrape_jobs").insert(payload).execute()
    rows = res.data or []
    if not rows or not rows[0].get("id"):
        raise RuntimeError("Supabase did not return a scrape job id")
    return str(rows[0]["id"])


def update_job_progress(job_id: str, progress: int, message: str) -> None:
    progress = max(0, min(100, int(progress)))
    try:
        supabase.table("scrape_jobs").update(
            {
                "status": "running",
                "progress": progress,
                "message": message,
                "completed": False,
                "failed": False,
                "error_message": None,
            }
        ).eq("id", job_id).execute()
    except APIError as e:
        logger.warning(
            "Could not update scrape job progress job_id=%s: %s",
            job_id,
            _format_postgrest_error(e),
        )


def mark_job_complete(job_id: str) -> None:
    try:
        supabase.table("scrape_jobs").update(
            {
                "status": "completed",
                "progress": 100,
                "message": "Completed successfully",
                "completed": True,
                "failed": False,
                "error_message": None,
                "completed_at": _utc_now_iso(),
            }
        ).eq("id", job_id).execute()
    except APIError as e:
        logger.warning(
            "Could not mark scrape job complete job_id=%s: %s",
            job_id,
            _format_postgrest_error(e),
        )


def mark_job_failed(job_id: str, error: str) -> None:
    message = str(error).strip() or "Scraper failed"
    try:
        supabase.table("scrape_jobs").update(
            {
                "status": "failed",
                "message": "Scraper failed",
                "completed": False,
                "failed": True,
                "error_message": message,
                "completed_at": _utc_now_iso(),
            }
        ).eq("id", job_id).execute()
    except APIError as e:
        logger.warning(
            "Could not mark scrape job failed job_id=%s: %s",
            job_id,
            _format_postgrest_error(e),
        )


def _run_scraper_background(user_id: str, job_id: str) -> None:
    try:
        run_scraper(
            user_id,
            headless=True,
            progress_callback=lambda progress, message: update_job_progress(
                job_id, progress, message
            ),
        )
        mark_job_complete(job_id)
        logger.info(
            "Background scraper finished successfully for user_id=%s job_id=%s",
            user_id,
            job_id,
        )
    except ScraperError as e:
        mark_job_failed(job_id, str(e))
        logger.error(
            "Background scraper failed for user_id=%s job_id=%s: %s",
            user_id,
            job_id,
            e,
        )
    except Exception as e:
        mark_job_failed(job_id, str(e))
        logger.exception(
            "Background scraper crashed for user_id=%s job_id=%s",
            user_id,
            job_id,
        )


def _run_asba_background(user_id: str, job_id: str) -> None:
    try:
        run_asba_apply(
            user_id,
            headless=True,
            progress_callback=lambda progress, message: update_job_progress(
                job_id, progress, message
            ),
        )
        mark_job_complete(job_id)
        logger.info(
            "Background ASBA apply finished successfully for user_id=%s job_id=%s",
            user_id,
            job_id,
        )
    except ScraperError as e:
        mark_job_failed(job_id, str(e))
        logger.error(
            "Background ASBA apply failed for user_id=%s job_id=%s: %s",
            user_id,
            job_id,
            e,
        )
    except Exception as e:
        mark_job_failed(job_id, str(e))
        logger.exception(
            "Background ASBA apply crashed for user_id=%s job_id=%s",
            user_id,
            job_id,
        )


class MeroshareCredentialsBody(BaseModel):
    username: str = Field(..., min_length=1)
    password: str | None = None
    dp_id: str = Field(..., min_length=1)
    crn: str = Field(..., min_length=1)
    transaction_pin: str | None = None


app = FastAPI(title="nepse-portfolio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    """Lightweight check for load balancers (e.g. Render health path)."""
    return {"status": "ok"}


@app.post("/api/meroshare/credentials")
def post_meroshare_credentials(
    body: MeroshareCredentialsBody,
    request: Request,
) -> dict:
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        try:
            user_id = verify_jwt_user_id(token)
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Could not verify token with Supabase Auth: {e!s}",
            ) from e

        try:
            fernet = _fernet()
        except (KeyError, ValueError, TypeError):
            raise HTTPException(
                status_code=500,
                detail="Invalid or missing ENCRYPTION_KEY in API environment",
            ) from None

        existing_res = (
            supabase.table("meroshare_credentials")
            .select("password_encrypted, transaction_pin_encrypted")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        existing = existing_res.data if existing_res else None

        pw = (body.password or "").strip()
        pin = (body.transaction_pin or "").strip()

        if not existing:
            if not pw:
                raise HTTPException(
                    status_code=400,
                    detail="Password is required when saving credentials for the first time",
                )
            if not pin:
                raise HTTPException(
                    status_code=400,
                    detail="Transaction PIN is required when saving credentials for the first time",
                )

        try:
            if pw:
                password_encrypted = fernet.encrypt(pw.encode("utf-8")).decode("ascii")
            elif existing:
                password_encrypted = existing["password_encrypted"]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Password is required when saving credentials for the first time",
                )

            if pin:
                pin_encrypted = fernet.encrypt(pin.encode("utf-8")).decode("ascii")
            elif existing:
                pin_encrypted = existing.get("transaction_pin_encrypted")
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Transaction PIN is required when saving credentials for the first time",
                )
        except HTTPException:
            raise
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=500,
                detail="Invalid or missing ENCRYPTION_KEY in API environment",
            ) from None

        supabase.table("meroshare_credentials").upsert(
            {
                "user_id": user_id,
                "username": body.username.strip(),
                "password_encrypted": password_encrypted,
                "dp_id": body.dp_id.strip(),
                "crn": body.crn.strip(),
                "transaction_pin_encrypted": pin_encrypted,
            },
            on_conflict="user_id",
        ).execute()
    except HTTPException:
        raise
    except APIError as e:
        logger.warning("meroshare_credentials upsert failed: %s", e.json())
        raise HTTPException(
            status_code=502,
            detail=_format_postgrest_error(e),
        ) from e

    return {"ok": True}


def _bearer_token(request: Request) -> str:
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return token


@app.post("/refresh")
def post_refresh(request: Request, background_tasks: BackgroundTasks) -> dict:
    """
    Verify JWT, ensure MeroShare credentials exist, start Playwright scraper in a
    background thread pool. Returns immediately.
    """
    token = _bearer_token(request)
    try:
        user_id = verify_jwt_user_id(token)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not verify token with Supabase Auth: {e!s}",
        ) from e

    cred = (
        supabase.table("meroshare_credentials")
        .select("user_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not (cred.data or []):
        raise HTTPException(
            status_code=400,
            detail="Save MeroShare credentials in the dashboard before scraping.",
        )

    try:
        job_id = create_scrape_job(user_id)
    except APIError as e:
        logger.warning("scrape_jobs insert failed: %s", e.json())
        raise HTTPException(
            status_code=502,
            detail=_format_postgrest_error(e),
        ) from e
    except Exception as e:
        logger.exception("scrape_jobs insert failed unexpectedly")
        raise HTTPException(
            status_code=502,
            detail=f"Could not create scrape job: {e!s}",
        ) from e

    background_tasks.add_task(_run_scraper_background, user_id, job_id)
    logger.info("Queued background scraper for user_id=%s job_id=%s", user_id, job_id)
    return {"jobId": job_id, "status": "scraper started"}


@app.post("/refresh/asba")
def post_refresh_asba(request: Request, background_tasks: BackgroundTasks) -> dict:
    """
    Verify JWT, ensure MeroShare credentials include CRN and transaction PIN,
    start ASBA IPO apply in a background thread pool. Returns immediately.
    """
    token = _bearer_token(request)
    try:
        user_id = verify_jwt_user_id(token)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not verify token with Supabase Auth: {e!s}",
        ) from e

    cred = (
        supabase.table("meroshare_credentials")
        .select("user_id, crn, transaction_pin_encrypted")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = cred.data or []
    if not rows:
        raise HTTPException(
            status_code=400,
            detail="Save MeroShare credentials in the dashboard before applying for ASBA.",
        )
    row = rows[0]
    missing = []
    if not (row.get("crn") or "").strip():
        missing.append("CRN")
    if not (row.get("transaction_pin_encrypted") or "").strip():
        missing.append("transaction PIN")
    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                "Save MeroShare credentials with "
                + " and ".join(missing)
                + " before applying for ASBA."
            ),
        )

    try:
        job_id = create_scrape_job(user_id)
    except APIError as e:
        logger.warning("scrape_jobs insert failed: %s", e.json())
        raise HTTPException(
            status_code=502,
            detail=_format_postgrest_error(e),
        ) from e
    except Exception as e:
        logger.exception("scrape_jobs insert failed unexpectedly")
        raise HTTPException(
            status_code=502,
            detail=f"Could not create scrape job: {e!s}",
        ) from e

    background_tasks.add_task(_run_asba_background, user_id, job_id)
    logger.info(
        "Queued background ASBA apply for user_id=%s job_id=%s", user_id, job_id
    )
    return {"jobId": job_id, "status": "asba apply started"}
