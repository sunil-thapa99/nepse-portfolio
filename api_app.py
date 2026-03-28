"""FastAPI app: POST /api/meroshare/credentials (JWT + Fernet + Supabase upsert)."""

import logging
import os
import shutil
import subprocess
from pathlib import Path

import httpx
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from postgrest.exceptions import APIError

load_dotenv()

from supabase_client import supabase

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

_REPO_ROOT = Path(__file__).resolve().parent
_SCRAPE_TIMEOUT_SEC = 3600


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


class MeroshareCredentialsBody(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    dp_id: str = Field(..., min_length=1)


app = FastAPI(title="nepse-portfolio API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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


@app.post("/api/scrape")
def post_scrape(request: Request) -> dict:
    """
    Verify JWT, ensure MeroShare credentials exist, run Selenium scraper subprocess
    (main.py --user-id ... --mode both) to refresh transactions / purchase_sources.
    """
    token = _bearer_token(request)
    user_id = verify_jwt_user_id(token)

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

    uv = shutil.which("uv")
    if uv:
        cmd = [uv, "run", "python", "main.py", "--user-id", user_id, "--mode", "both"]
    else:
        cmd = [
            os.environ.get("PYTHON", "python3"),
            str(_REPO_ROOT / "main.py"),
            "--user-id",
            user_id,
            "--mode",
            "both",
        ]

    proc = subprocess.run(
        cmd,
        cwd=str(_REPO_ROOT),
        capture_output=True,
        text=True,
        timeout=_SCRAPE_TIMEOUT_SEC,
        env=os.environ.copy(),
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        tail = err[-4000:] if len(err) > 4000 else err
        raise HTTPException(
            status_code=500,
            detail=f"Scraper failed (exit {proc.returncode}): {tail or 'no output'}",
        )

    return {"ok": True}
