from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import get_session
from app.deps import current_user
from app.models import User, UserProblemBest

router = APIRouter(prefix="/ranking", tags=["ranking"])


class RankRow(BaseModel):
    rank: int
    user_id: UUID
    name: str
    username: str | None
    total_score: int
    solved: int  # problems at 100
    first_full_at: datetime | None


@router.get("", response_model=list[RankRow])
async def global_ranking(
    limit: int = Query(default=100, ge=1, le=500),
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[RankRow]:
    # Aggregate the denormalized best-scores. Order: total desc, earliest full asc.
    total = func.sum(UserProblemBest.best_score).label("total")
    solved = func.count().filter(UserProblemBest.best_score == 100).label("solved")
    first_full = func.min(UserProblemBest.first_full_score_at).label("first_full")

    stmt = (
        select(User.id, User.name, User.username, total, solved, first_full)
        .join(UserProblemBest, UserProblemBest.user_id == User.id)
        .group_by(User.id, User.name, User.username)
        .order_by(total.desc(), first_full.asc().nulls_last())
        .limit(limit)
    )
    rows = (await session.exec(stmt)).all()
    return [
        RankRow(
            rank=i + 1,
            user_id=r[0],
            name=r[1],
            username=r[2],
            total_score=int(r[3] or 0),
            solved=int(r[4] or 0),
            first_full_at=r[5],
        )
        for i, r in enumerate(rows)
    ]
