"""
Async Judge0 client. One submission per testcase, callback-driven.

Judge0 language ids — pinned to the image (judge0/judge0:1.13.1):
- 54  : C++ (GCC 9.2.0)  -- present in stock image
- 71  : Python (3.8.1)   -- present in stock image
- 105 : C++ (GCC 12.2.0) -- judge0:1.13 ships this
- 100 : Python (3.11.2)  -- judge0:1.13 ships this

We prefer the newer ones (105 / 100). Fallback handled in `pick_language_id`.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.models import Language
from app.settings import settings

log = logging.getLogger(__name__)


# Preferred ids per language (newest first).
_LANG_PREF: dict[Language, list[int]] = {
    Language.cpp: [105, 54],
    Language.python: [100, 71],
}


def _b64(s: str | bytes) -> str:
    if isinstance(s, str):
        s = s.encode()
    return base64.b64encode(s).decode("ascii")


def _client() -> httpx.AsyncClient:
    headers = {"X-Auth-Token": settings.judge0_auth_token} if settings.judge0_auth_token else {}
    return httpx.AsyncClient(base_url=settings.judge0_url, headers=headers, timeout=30.0)


_lang_cache: dict[Language, int] = {}


async def pick_language_id(lang: Language) -> int:
    """Resolve the best Judge0 language id available in this Judge0 instance."""
    if lang in _lang_cache:
        return _lang_cache[lang]
    async with _client() as c:
        r = await c.get("/languages")
        r.raise_for_status()
        available = {row["id"] for row in r.json()}
    for candidate in _LANG_PREF[lang]:
        if candidate in available:
            _lang_cache[lang] = candidate
            return candidate
    raise RuntimeError(f"no Judge0 language id available for {lang}")


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=0.5, max=4))
async def submit_one(
    *,
    source: str,
    language: Language,
    stdin: bytes,
    expected: bytes,
    cpu_time_limit_s: float,
    memory_limit_kb: int,
    callback_url: str,
    compiler_options: str | None = None,
) -> str:
    """
    Post one testcase to Judge0. Returns the submission token.
    Judge0 will POST to `callback_url` when verdict is ready.
    """
    payload: dict[str, Any] = {
        "language_id": await pick_language_id(language),
        "source_code": _b64(source),
        "stdin": _b64(stdin),
        "expected_output": _b64(expected),
        "cpu_time_limit": round(cpu_time_limit_s, 2),
        "wall_time_limit": round(cpu_time_limit_s * 2 + 1, 2),
        "memory_limit": memory_limit_kb,
        "callback_url": callback_url,
        "redirect_stderr_to_stdout": False,
        # isolate 1.8.1 needs cgroup v1. WSL2 is cgroup v2 only.
        # Setting BOTH per-process flags makes Judge0 drop `--cg` and use
        # isolate `-m` (address-space) limits instead — works without cgroups.
        # See isolate_job.rb:57 in the Judge0 image.
        "enable_per_process_and_thread_time_limit": True,
        "enable_per_process_and_thread_memory_limit": True,
    }
    if compiler_options:
        payload["compiler_options"] = compiler_options

    async with _client() as c:
        r = await c.post(
            "/submissions",
            params={"base64_encoded": "true", "wait": "false"},
            json=payload,
        )
        r.raise_for_status()
        token = r.json()["token"]
    log.info("judge0.submit_one token=%s lang=%s", token, language)
    return token


async def fetch_verdict(token: str) -> dict[str, Any]:
    """Fallback if callback drops — poll for verdict."""
    async with _client() as c:
        r = await c.get(
            f"/submissions/{token}",
            params={"base64_encoded": "true", "fields": "*"},
        )
        r.raise_for_status()
        return r.json()
