"""Fernet decrypt for MeroShare passwords (same ENCRYPTION_KEY as api_app)."""

import os

from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()


def fernet() -> Fernet:
    key = os.environ["ENCRYPTION_KEY"].strip().encode("utf-8")
    return Fernet(key)


def decrypt_password(encrypted_ascii: str) -> str:
    """Decrypt Fernet token stored as ASCII in DB."""
    return fernet().decrypt(encrypted_ascii.encode("ascii")).decode("utf-8")
