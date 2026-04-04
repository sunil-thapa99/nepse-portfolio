"""FastAPI app: POST /api/meroshare/credentials, POST /refresh (background scraper)."""

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

from main import ScraperError, run_scraper
from supabase_client import supabase

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

_DEFAULT_CORS = "http://localhost:5173,http://127.0.0.1:5173"


def _cors_allow_origins() -> list[str]:
    raw = os.environ.get("CORS_ALLOW_ORIGINS", _DEFAULT_CORS)
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


def _run_scraper_background(user_id: str) -> None:
    try:
        run_scraper(user_id, headless=True)
        logger.info("Background scraper finished successfully for user_id=%s", user_id)
    except ScraperError as e:
        logger.error(
            "Background scraper failed for user_id=%s: %s",
            user_id,
            e,
        )
    except Exception:
        logger.exception("Background scraper crashed for user_id=%s", user_id)


class MeroshareCredentialsBody(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    dp_id: str = Field(..., min_length=1)


app = FastAPI(title="nepse-portfolio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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

        try:
            encrypted = fernet.encrypt(body.password.encode("utf-8")).decode("ascii")
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=500,
                detail="Invalid or missing ENCRYPTION_KEY in API environment",
            ) from None

        supabase.table("meroshare_credentials").upsert(
            {
                "user_id": user_id,
                "username": body.username.strip(),
                "password_encrypted": encrypted,
                "dp_id": body.dp_id.strip(),
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
    Verify JWT, ensure MeroShare credentials exist, start Selenium scraper in a
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

    background_tasks.add_task(_run_scraper_background, user_id)
    logger.info("Queued background scraper for user_id=%s", user_id)
    return {"status": "scraper started"}
