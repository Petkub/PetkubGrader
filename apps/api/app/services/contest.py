"""
Contest logic: time windows, problem-access gating, scoreboard.

Window:
- live    : everyone shares [contest.start_at, start_at + duration_min].
- virtual : per-user [participant.started_at, started_at + duration_min];
            None until the user clicks "start".

A user may view/submit a contest's (possibly hidden) problems only while their
window is open. Submissions made in-window are tagged with `contest_id`, and the
scoreboard aggregates strictly over those tagged rows.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import (
    Contest,
    ContestMode,
    ContestParticipant,
    ContestProblem,
    Problem,
    Role,
    Submission,
    User,
)


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def window(contest: Contest, participant: ContestParticipant | None) -> tuple[datetime | None, datetime | None]:
    """Return (start, end) of the user's window, or (None, None) if not opened."""
    dur = timedelta(minutes=contest.duration_min)
    if contest.mode == ContestMode.live:
        return contest.start_at, contest.start_at + dur
    # virtual
    if participant is None or participant.started_at is None:
        return None, None
    return participant.started_at, participant.started_at + dur


def window_open(contest: Contest, participant: ContestParticipant | None, now: datetime | None = None) -> bool:
    now = now or _now()
    start, end = window(contest, participant)
    return start is not None and start <= now < end


def globally_ended(contest: Contest, now: datetime | None = None) -> bool:
    """The scheduled window (start_at + duration) has passed — safe to release problems.
    For virtual contests this is the nominal close, after which no new starts make sense."""
    now = now or _now()
    return now >= contest.start_at + timedelta(minutes=contest.duration_min)


def status_for(contest: Contest, participant: ContestParticipant | None, now: datetime | None = None) -> str:
    """upcoming | running | ended  (live: global; virtual: relative to the user)."""
    now = now or _now()
    if contest.mode == ContestMode.live:
        end = contest.start_at + timedelta(minutes=contest.duration_min)
        if now < contest.start_at:
            return "upcoming"
        return "running" if now < end else "ended"
    # virtual
    if participant is None or participant.started_at is None:
        return "upcoming"  # not started by this user yet
    return "running" if window_open(contest, participant, now) else "ended"


async def get_participant(
    session: AsyncSession, contest_id: UUID, user_id: UUID
) -> ContestParticipant | None:
    return (
        await session.exec(
            select(ContestParticipant)
            .where(ContestParticipant.contest_id == contest_id)
            .where(ContestParticipant.user_id == user_id)
        )
    ).first()


async def active_contest_for_problem(
    session: AsyncSession, user: User, problem_id: UUID
) -> Contest | None:
    """The contest (if any) currently granting this user access to `problem_id`."""
    rows = (
        await session.exec(
            select(Contest)
            .join(ContestProblem, ContestProblem.contest_id == Contest.id)
            .where(ContestProblem.problem_id == problem_id)
            .where(Contest.is_published.is_(True))  # type: ignore[union-attr]
        )
    ).all()
    for c in rows:
        part = await get_participant(session, c.id, user.id)
        if window_open(c, part):
            return c
    return None


async def user_can_access_problem(session: AsyncSession, user: User, problem: Problem) -> bool:
    if problem.is_public:
        return True
    if user.role in (Role.admin, Role.setter):
        return True
    return (await active_contest_for_problem(session, user, problem.id)) is not None


async def compute_scoreboard(session: AsyncSession, contest: Contest) -> list[dict]:
    """
    Per participant: sum of best score per contest problem (over contest-tagged
    submissions), tiebreak by the earliest moment they locked their final total.
    Returns rows sorted best-first.
    """
    cp_rows = (
        await session.exec(
            select(ContestProblem).where(ContestProblem.contest_id == contest.id).order_by(ContestProblem.ord)
        )
    ).all()
    problem_ids = [cp.problem_id for cp in cp_rows]
    alias_by_pid = {cp.problem_id: cp.alias for cp in cp_rows}
    if not problem_ids:
        return []

    subs = (
        await session.exec(
            select(Submission)
            .where(Submission.contest_id == contest.id)
            .where(Submission.problem_id.in_(problem_ids))  # type: ignore[union-attr]
            .order_by(Submission.created_at)
        )
    ).all()

    # participant -> problem -> (best_score, earliest_time_at_best)
    agg: dict[UUID, dict[UUID, tuple[int, datetime]]] = {}
    for s in subs:
        per = agg.setdefault(s.user_id, {})
        cur = per.get(s.problem_id)
        if cur is None or s.total_score > cur[0]:
            per[s.problem_id] = (s.total_score, s.created_at)

    # hydrate user display
    rows: list[dict] = []
    for uid, per in agg.items():
        u = await session.get(User, uid)
        total = sum(v[0] for v in per.values())
        lock = max((v[1] for v in per.values()), default=None)
        rows.append(
            {
                "user_id": uid,
                "name": u.name if u else "?",
                "username": u.username if u else None,
                "total_score": total,
                "lock_at": lock,
                "per_problem": {alias_by_pid[pid]: sc for pid, (sc, _) in per.items()},
            }
        )

    rows.sort(key=lambda r: (-r["total_score"], r["lock_at"] or _now()))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows
