import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import get_session
from app.deps import current_user, current_user_not_banned, require_setter
from app.models import (
    AuditLog,
    Contest,
    ContestMode,
    ContestParticipant,
    ContestProblem,
    Problem,
    User,
)
from app.services import contest as contest_svc

router = APIRouter(prefix="/contests", tags=["contests"])


# ---------- DTOs ----------

class ContestSummary(BaseModel):
    slug: str
    title: str
    mode: ContestMode
    start_at: datetime
    duration_min: int
    status: str  # upcoming | running | ended (relative to viewer)
    registered: bool
    is_published: bool


class ContestProblemOut(BaseModel):
    alias: str
    slug: str | None  # null when locked (window closed / not started)
    title: str | None
    your_best_score: int | None


class ContestDetailOut(ContestSummary):
    description_md: str
    can_access_problems: bool  # window currently open
    can_release: bool  # scheduled window ended → setter may publish problems
    started_at: datetime | None
    problems: list[ContestProblemOut]


class ContestCreateIn(BaseModel):
    slug: str
    title: str
    description_md: str = ""
    mode: ContestMode = ContestMode.virtual
    start_at: datetime
    duration_min: int


class ContestProblemAddIn(BaseModel):
    problem_slug: str
    alias: str


# ---------- Member endpoints ----------

@router.get("", response_model=list[ContestSummary])
async def list_contests(
    user: User = Depends(current_user_not_banned),
    session: AsyncSession = Depends(get_session),
) -> list[ContestSummary]:
    stmt = select(Contest).order_by(Contest.start_at.desc())
    if user.role.value not in ("admin", "setter"):
        stmt = stmt.where(Contest.is_published.is_(True))  # type: ignore[union-attr]
    rows = (await session.exec(stmt)).all()
    out: list[ContestSummary] = []
    for c in rows:
        part = await contest_svc.get_participant(session, c.id, user.id)
        out.append(
            ContestSummary(
                slug=c.slug, title=c.title, mode=c.mode, start_at=c.start_at,
                duration_min=c.duration_min, status=contest_svc.status_for(c, part),
                registered=part is not None, is_published=c.is_published,
            )
        )
    return out


async def _load(session: AsyncSession, slug: str) -> Contest:
    c = (await session.exec(select(Contest).where(Contest.slug == slug))).first()
    if c is None:
        raise HTTPException(404, "contest not found")
    return c


@router.get("/{slug}", response_model=ContestDetailOut)
async def get_contest(
    slug: str,
    user: User = Depends(current_user_not_banned),
    session: AsyncSession = Depends(get_session),
) -> ContestDetailOut:
    c = await _load(session, slug)
    if not c.is_published and user.role.value not in ("admin", "setter"):
        raise HTTPException(404, "contest not found")
    part = await contest_svc.get_participant(session, c.id, user.id)
    can_access = contest_svc.window_open(c, part)

    cps = (
        await session.exec(
            select(ContestProblem).where(ContestProblem.contest_id == c.id).order_by(ContestProblem.ord)
        )
    ).all()
    problems: list[ContestProblemOut] = []
    for cp in cps:
        p = await session.get(Problem, cp.problem_id)
        reveal = can_access or user.role.value in ("admin", "setter")
        if reveal and p is not None:
            from app.models import UserProblemBest
            best = await session.get(UserProblemBest, (user.id, p.id))
            problems.append(
                ContestProblemOut(
                    alias=cp.alias, slug=p.slug, title=p.title,
                    your_best_score=best.best_score if best else 0,
                )
            )
        else:
            problems.append(ContestProblemOut(alias=cp.alias, slug=None, title=None, your_best_score=None))

    return ContestDetailOut(
        slug=c.slug, title=c.title, mode=c.mode, start_at=c.start_at,
        duration_min=c.duration_min, status=contest_svc.status_for(c, part),
        registered=part is not None, is_published=c.is_published,
        description_md=c.description_md, can_access_problems=can_access,
        can_release=contest_svc.globally_ended(c),
        started_at=part.started_at if part else None, problems=problems,
    )


@router.post("/{slug}/register", response_model=ContestDetailOut)
async def register(
    slug: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ContestDetailOut:
    c = await _load(session, slug)
    if not c.is_published:
        raise HTTPException(404, "contest not found")
    part = await contest_svc.get_participant(session, c.id, user.id)
    if part is None:
        session.add(ContestParticipant(contest_id=c.id, user_id=user.id))
        await session.commit()
    return await get_contest(slug, user, session)


@router.post("/{slug}/start", response_model=ContestDetailOut)
async def start(
    slug: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ContestDetailOut:
    """Virtual contests: begin the personal window. Live contests start on the global clock."""
    c = await _load(session, slug)
    if c.mode != ContestMode.virtual:
        raise HTTPException(400, "only virtual contests are started manually")
    part = await contest_svc.get_participant(session, c.id, user.id)
    if part is None:
        part = ContestParticipant(contest_id=c.id, user_id=user.id)
        session.add(part)
        await session.flush()
    if part.started_at is not None:
        raise HTTPException(400, "already started")
    part.started_at = datetime.now(tz=timezone.utc)
    await session.commit()
    return await get_contest(slug, user, session)


class ScoreboardRow(BaseModel):
    rank: int
    user_id: UUID
    name: str
    username: str | None
    total_score: int
    per_problem: dict[str, int]


@router.get("/{slug}/scoreboard", response_model=list[ScoreboardRow])
async def scoreboard(
    slug: str,
    user: User = Depends(current_user_not_banned),
    session: AsyncSession = Depends(get_session),
) -> list[ScoreboardRow]:
    c = await _load(session, slug)
    rows = await contest_svc.compute_scoreboard(session, c)
    return [
        ScoreboardRow(
            rank=r["rank"], user_id=r["user_id"], name=r["name"], username=r["username"],
            total_score=r["total_score"], per_problem=r["per_problem"],
        )
        for r in rows
    ]


# ---------- Setter management ----------

@router.post("", response_model=ContestSummary, status_code=201)
async def create_contest(
    payload: ContestCreateIn,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ContestSummary:
    if (await session.exec(select(Contest).where(Contest.slug == payload.slug))).first():
        raise HTTPException(409, "slug taken")
    start = payload.start_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    c = Contest(
        slug=payload.slug, title=payload.title, description_md=payload.description_md,
        mode=payload.mode, start_at=start, duration_min=payload.duration_min,
        is_published=False, created_by_id=setter.id,
    )
    session.add(c)
    await session.commit()
    return ContestSummary(
        slug=c.slug, title=c.title, mode=c.mode, start_at=c.start_at, duration_min=c.duration_min,
        status="upcoming", registered=False, is_published=False,
    )


@router.post("/{slug}/problems", response_model=ContestDetailOut)
async def add_problem(
    slug: str,
    payload: ContestProblemAddIn,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ContestDetailOut:
    c = await _load(session, slug)
    p = (await session.exec(select(Problem).where(Problem.slug == payload.problem_slug))).first()
    if p is None:
        raise HTTPException(404, "problem not found")
    existing = (
        await session.exec(select(ContestProblem).where(ContestProblem.contest_id == c.id))
    ).all()
    if any(cp.problem_id == p.id for cp in existing):
        raise HTTPException(409, "problem already in contest")
    if any(cp.alias == payload.alias for cp in existing):
        raise HTTPException(409, "alias already used")
    ord_ = max((cp.ord for cp in existing), default=-1) + 1
    session.add(ContestProblem(contest_id=c.id, problem_id=p.id, ord=ord_, alias=payload.alias))
    await session.commit()
    return await get_contest(slug, setter, session)


class ContestNewProblemIn(BaseModel):
    title: str
    alias: str


class NewProblemOut(BaseModel):
    problem_slug: str


@router.post("/{slug}/problems/new", response_model=NewProblemOut)
async def create_problem_for_contest(
    slug: str,
    payload: ContestNewProblemIn,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> NewProblemOut:
    """Create a fresh HIDDEN problem and attach it to the contest in one step.
    The setter then uploads testcases on the problem's edit page. Stays hidden
    until the contest is released."""
    c = await _load(session, slug)
    existing = (
        await session.exec(select(ContestProblem).where(ContestProblem.contest_id == c.id))
    ).all()
    if any(cp.alias == payload.alias for cp in existing):
        raise HTTPException(409, "alias already used")

    # Derive a unique slug from contest + alias.
    base = re.sub(r"[^a-z0-9-]+", "-", f"{c.slug}-{payload.alias}".lower()).strip("-") or "problem"
    pslug = base
    n = 1
    while (await session.exec(select(Problem).where(Problem.slug == pslug))).first() is not None:
        n += 1
        pslug = f"{base}-{n}"

    p = Problem(slug=pslug, title=payload.title, is_public=False, created_by_id=setter.id)
    session.add(p)
    await session.flush()
    ord_ = max((cp.ord for cp in existing), default=-1) + 1
    session.add(ContestProblem(contest_id=c.id, problem_id=p.id, ord=ord_, alias=payload.alias))
    await session.commit()
    return NewProblemOut(problem_slug=pslug)


@router.post("/{slug}/release", response_model=ContestDetailOut)
async def release_problems(
    slug: str,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ContestDetailOut:
    """Publish all of a contest's problems to the public problemset. Only once the
    scheduled window has ended, so problems stay secret during the contest."""
    c = await _load(session, slug)
    if not contest_svc.globally_ended(c):
        raise HTTPException(400, "cannot release until the contest has ended")
    cps = (
        await session.exec(select(ContestProblem).where(ContestProblem.contest_id == c.id))
    ).all()
    for cp in cps:
        p = await session.get(Problem, cp.problem_id)
        if p is not None:
            p.is_public = True
    session.add(
        AuditLog(actor_id=setter.id, action="contest.release", target_kind="contest", target_id=str(c.id))
    )
    await session.commit()
    return await get_contest(slug, setter, session)


@router.post("/{slug}/publish", response_model=ContestSummary)
async def publish_contest(
    slug: str,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ContestSummary:
    c = await _load(session, slug)
    n = (await session.exec(select(ContestProblem).where(ContestProblem.contest_id == c.id))).all()
    if not n:
        raise HTTPException(400, "cannot publish: no problems")
    c.is_published = True
    session.add(AuditLog(actor_id=setter.id, action="contest.publish", target_kind="contest", target_id=str(c.id)))
    await session.commit()
    part = await contest_svc.get_participant(session, c.id, setter.id)
    return ContestSummary(
        slug=c.slug, title=c.title, mode=c.mode, start_at=c.start_at, duration_min=c.duration_min,
        status=contest_svc.status_for(c, part), registered=part is not None, is_published=True,
    )
