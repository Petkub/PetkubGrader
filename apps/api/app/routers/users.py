import re
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import get_session
from app.deps import current_user, current_user_unverified, require_internal_key
from app.models import Problem, Role, User, UserProblemBest, UserStatus

router = APIRouter(prefix="/users", tags=["users"])

USERNAME_RE = re.compile(r"^[a-z0-9_-]{3,30}$")


class UserUpsertIn(BaseModel):
    email: EmailStr
    name: str
    image_url: str | None = None


class UserOut(BaseModel):
    id: UUID
    email: str
    name: str
    role: Role
    status: UserStatus
    image_url: str | None
    created_at: datetime


@router.post("/upsert", response_model=UserOut, dependencies=[Depends(require_internal_key)])
async def upsert_user(payload: UserUpsertIn, session: AsyncSession = Depends(get_session)) -> User:
    """Called by Next.js on Auth.js sign-in. Creates user as `pending` if new."""
    result = await session.exec(select(User).where(User.email == payload.email))
    user = result.first()
    if user is None:
        user = User(
            email=payload.email,
            name=payload.name,
            image_url=payload.image_url,
            role=Role.member,
            status=UserStatus.pending,
        )
        session.add(user)
    else:
        user.name = payload.name
        if payload.image_url:
            user.image_url = payload.image_url
    await session.commit()
    await session.refresh(user)
    return user


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)) -> User:
    return user


class UserStatusOut(BaseModel):
    id: UUID
    name: str
    username: str | None
    school: str | None
    role: Role
    status: UserStatus


@router.get("/me/status", response_model=UserStatusOut)
async def my_status(user: User = Depends(current_user_unverified)) -> User:
    """Works for pending/banned too — drives the onboarding/approval UI."""
    return user


class MeUpdateIn(BaseModel):
    name: str | None = None
    username: str | None = None
    school: str | None = None


@router.patch("/me", response_model=UserStatusOut)
async def update_me(
    payload: MeUpdateIn,
    user: User = Depends(current_user_unverified),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Self-service profile edit. Approved or pending may set their handle/name/school."""
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "name cannot be empty")
        user.name = name[:80]
    if payload.username is not None:
        uname = payload.username.strip().lower()
        if not USERNAME_RE.match(uname):
            raise HTTPException(400, "username must be 3–30 chars: a-z, 0-9, _ or -")
        user.username = uname
    if payload.school is not None:
        user.school = payload.school.strip()[:120] or None

    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise HTTPException(409, "username already taken") from e
    await session.refresh(user)
    return user


class SolvedProblemOut(BaseModel):
    slug: str
    title: str
    solved_at: datetime | None


class ProfileOut(BaseModel):
    name: str
    username: str
    school: str | None
    total_score: int
    rank: int
    solved_count: int
    solved: list[SolvedProblemOut]


@router.get("/by-username/{username}", response_model=ProfileOut)
async def get_profile(
    username: str,
    _viewer: User = Depends(current_user),  # approved-only
    session: AsyncSession = Depends(get_session),
) -> ProfileOut:
    target = (
        await session.exec(select(User).where(User.username == username.lower()))
    ).first()
    if target is None:
        raise HTTPException(404, "user not found")

    # Totals for this user.
    my_total = (
        await session.exec(
            select(func.coalesce(func.sum(UserProblemBest.best_score), 0)).where(
                UserProblemBest.user_id == target.id
            )
        )
    ).one()

    # Rank = 1 + number of users with a strictly higher total.
    totals_subq = (
        select(func.sum(UserProblemBest.best_score).label("t"))
        .group_by(UserProblemBest.user_id)
        .subquery()
    )
    higher = (
        await session.exec(select(func.count()).select_from(totals_subq).where(totals_subq.c.t > my_total))
    ).one()

    # Fully-solved problems, newest first.
    rows = (
        await session.exec(
            select(Problem.slug, Problem.title, UserProblemBest.first_full_score_at)
            .join(UserProblemBest, UserProblemBest.problem_id == Problem.id)
            .where(UserProblemBest.user_id == target.id, UserProblemBest.best_score == 100)
            .order_by(UserProblemBest.first_full_score_at.desc().nulls_last())
        )
    ).all()
    solved = [SolvedProblemOut(slug=r[0], title=r[1], solved_at=r[2]) for r in rows]

    return ProfileOut(
        name=target.name,
        username=target.username or "",
        school=target.school,
        total_score=int(my_total or 0),
        rank=int(higher) + 1,
        solved_count=len(solved),
        solved=solved,
    )
