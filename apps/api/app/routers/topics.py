from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import get_session
from app.deps import current_user
from app.models import Topic, User

router = APIRouter(prefix="/topics", tags=["topics"])


class TopicOut(BaseModel):
    id: UUID
    slug: str
    name: str


@router.get("", response_model=list[TopicOut])
async def list_topics(
    _user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Topic]:
    return list((await session.exec(select(Topic).order_by(Topic.name))).all())
