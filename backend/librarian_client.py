import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv
import httpx
from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader


def upstream_url() -> str:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", interpolate=False)
    value = (os.getenv("PATRON_LIBRARIAN_URL") or "http://127.0.0.1:8000").rstrip("/")
    url = urlsplit(value)
    local = url.hostname in {"localhost", "127.0.0.1", "::1"}
    if (not url.hostname or url.username is not None or url.password is not None
            or url.query or url.fragment or "\\" in value
            or not (url.scheme == "https" or (local and url.scheme == "http"))):
        raise ValueError("Configure PATRON_LIBRARIAN_URL with an HTTPS URL or a loopback HTTP URL.")
    return value


UPSTREAM = upstream_url()
key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def upstream(key: str = Depends(key_header)):
    if not key:
        raise HTTPException(401, "Enter your Patron key.")
    with httpx.Client(base_url=UPSTREAM + "/", headers={"X-API-Key": key},
                      timeout=httpx.Timeout(120, connect=5), follow_redirects=False,
                      trust_env=False) as client:
        yield client


def forward(client, method, path, **kwargs):
    try:
        response = client.request(method, path, **kwargs)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        messages = {
            400: "Librarian rejected this request. Check the document or provider settings.",
            401: "Librarian rejected the key. Enter a dedicated Patron key.",
            403: "This key lacks permission.",
            404: "Resource unavailable. Check the document ID and Librarian version.",
            413: "Upload exceeds the server limit.",
            422: "Librarian could not validate the request.",
            429: "Librarian is busy. Try again shortly.",
        }
        raise HTTPException(code if code in messages else 502,
                            messages.get(code, "Librarian could not complete the request.")) from None
    except httpx.TimeoutException:
        raise HTTPException(504, "Librarian timed out. Check its status before retrying.") from None
    except (httpx.RequestError, ValueError):
        raise HTTPException(502, "Could not read a response from Librarian.") from None
