"""
Redis-backed submission rate limit.

Two checks:
  - cooldown   : 1 submission per N seconds per user
  - concurrent : max M submissions in `queued` or `judging` per user
"""

from __future__ import annotations

from uuid import UUID

import redis.asyncio as aioredis
from fastapi import HTTPException, status

from app.settings import settings

_redis: aioredis.Redis | None = None


def _r() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def check_and_take_slot(user_id: UUID) -> None:
    r = _r()
    cooldown_key = f"sub:cd:{user_id}"
    concurrent_key = f"sub:conc:{user_id}"

    # Cooldown — SET NX EX
    ok = await r.set(cooldown_key, "1", ex=10, nx=True)
    if not ok:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"slow down — 1 submission per 10s",
        )

    # Concurrent — INCR, check, decrement if too high
    current = await r.incr(concurrent_key)
    if current > settings.submission_max_concurrent:
        await r.decr(concurrent_key)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"max {settings.submission_max_concurrent} pending submissions",
        )


async def release_slot(user_id: UUID) -> None:
    """Call after submission finalized (status=done|error)."""
    await _r().decr(f"sub:conc:{user_id}")
