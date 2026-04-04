"""Supabase client for server-side use (service role)."""

import base64
import json
import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()


def _jwt_role_without_verify(token: str) -> str | None:
    """Read `role` from a Supabase JWT payload without verifying the signature."""
    t = token.strip()
    parts = t.split(".")
    if len(parts) != 3:
        return None
    try:
        payload_b64 = parts[1]
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
        role = payload.get("role")
        return role if isinstance(role, str) else None
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def _create_client() -> Client:
    _url = os.environ["SUPABASE_URL"].strip()
    _key = os.environ["SUPABASE_SERVICE_KEY"].strip()
    _role = _jwt_role_without_verify(_key)
    if _role is not None and _role != "service_role":
        raise RuntimeError(
            "SUPABASE_SERVICE_KEY must be the service_role JWT from Supabase "
            "(Project Settings → API → service_role secret). "
            "Do not use the anon/publishable key or a logged-in user's access token — "
            "PostgREST would enforce RLS and writes fail with 42501. "
            f"Decoded JWT role is {_role!r}. Restart the API after fixing `.env`."
        )
    return create_client(_url, _key)


class _LazySupabase:
    """Defer create_client until first use so imports (e.g. unit tests) work without env vars."""

    _client: Client | None = None

    def __getattr__(self, name: str):
        if self._client is None:
            self._client = _create_client()
        return getattr(self._client, name)


supabase: Client = _LazySupabase()  # type: ignore[assignment]
