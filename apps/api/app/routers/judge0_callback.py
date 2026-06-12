"""
Judge0 webhook receiver.

Judge0 has the source code + IO; this endpoint just records the verdict.
Shared-secret check via `key` query param — matches API_INTERNAL_KEY.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.services import grader
from app.settings import settings

router = APIRouter(prefix="/judge0", tags=["judge0"])


# Judge0 delivers verdicts via HTTP PUT. Accept POST too for flexibility.
@router.api_route("/callback", methods=["PUT", "POST"], status_code=status.HTTP_204_NO_CONTENT)
async def judge0_callback(
    payload: dict[str, Any],
    sub: UUID = Query(...),
    tc: UUID = Query(...),
    key: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> None:
    if key != settings.api_internal_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad key")
    await grader.on_callback(session, sub, tc, payload)
