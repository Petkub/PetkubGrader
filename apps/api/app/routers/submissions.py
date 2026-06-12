from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import SessionLocal, get_session
from app.deps import current_user, current_user_not_banned
from app.models import (
    Language,
    Problem,
    Role,
    Submission,
    SubmissionStatus,
    SubmissionTestcase,
    Subtask,
    User,
    UserProblemBest,
    Verdict,
)
from app.services import contest as contest_svc
from app.services import grader, rate_limit, storage

router = APIRouter(prefix="/submissions", tags=["submissions"])


class SubmitIn(BaseModel):
    problem_slug: str
    language: Language
    source: str = Field(min_length=1, max_length=65536)  # 64KB cap


class SubmissionOut(BaseModel):
    id: UUID
    problem_id: UUID
    language: Language
    status: SubmissionStatus
    overall_verdict: Verdict | None
    total_score: int
    max_time_ms: int
    max_memory_kb: int
    created_at: datetime
    can_view_source: bool


class SubmissionTestcaseOut(BaseModel):
    testcase_id: UUID
    subtask_id: UUID
    verdict: Verdict | None
    time_ms: int | None
    memory_kb: int | None
    score: int


class SubtaskMetaOut(BaseModel):
    id: UUID
    ord: int
    name: str
    weight: int
    is_sample: bool


class SubmissionDetailOut(SubmissionOut):
    compile_log: str | None
    error_message: str | None
    subtasks: list[SubtaskMetaOut]
    testcases: list[SubmissionTestcaseOut]
    source: str | None  # populated only if can_view_source


@router.post("", response_model=SubmissionOut, status_code=201)
async def submit(
    payload: SubmitIn,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> SubmissionOut:
    await rate_limit.check_and_take_slot(user.id)

    problem = (
        await session.exec(select(Problem).where(Problem.slug == payload.problem_slug))
    ).first()
    if problem is None or not await contest_svc.user_can_access_problem(session, user, problem):
        await rate_limit.release_slot(user.id)
        raise HTTPException(404, "problem not found")

    # If the problem is accessed via an open contest window, tag the submission so
    # it counts on that contest's scoreboard.
    active = await contest_svc.active_contest_for_problem(session, user, problem.id)

    sub = Submission(
        user_id=user.id,
        problem_id=problem.id,
        contest_id=active.id if active else None,
        language=payload.language,
        source_path="",
        source_size=len(payload.source.encode()),
        status=SubmissionStatus.queued,
    )
    session.add(sub)
    await session.commit()
    await session.refresh(sub)

    # Fan out to Judge0 in the background so submit returns fast.
    # NOTE: BackgroundTasks runs after response; uses a fresh session.
    background.add_task(_enqueue_in_bg, sub.id, payload.source)

    return SubmissionOut(
        id=sub.id,
        problem_id=sub.problem_id,
        language=sub.language,
        status=sub.status,
        overall_verdict=sub.overall_verdict,
        total_score=sub.total_score,
        max_time_ms=sub.max_time_ms,
        max_memory_kb=sub.max_memory_kb,
        created_at=sub.created_at,
        can_view_source=True,
    )


async def _enqueue_in_bg(sub_id: UUID, source: str) -> None:
    async with SessionLocal() as s:
        sub = await s.get(Submission, sub_id)
        if sub is None:
            return
        await grader.enqueue_submission(s, sub, source)


class SubmissionListRow(BaseModel):
    id: UUID
    problem_slug: str
    problem_title: str
    language: Language
    status: SubmissionStatus
    overall_verdict: Verdict | None
    total_score: int
    max_time_ms: int
    created_at: datetime


@router.get("", response_model=list[SubmissionListRow])
async def list_my_submissions(
    problem: str | None = Query(default=None, description="filter by problem slug"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(current_user_not_banned),
    session: AsyncSession = Depends(get_session),
) -> list[SubmissionListRow]:
    stmt = (
        select(Submission, Problem.slug, Problem.title)
        .join(Problem, Problem.id == Submission.problem_id)
        .where(Submission.user_id == user.id)
    )
    if problem:
        stmt = stmt.where(Problem.slug == problem)
    stmt = stmt.order_by(Submission.created_at.desc()).limit(limit).offset(offset)

    rows = (await session.exec(stmt)).all()
    return [
        SubmissionListRow(
            id=sub.id,
            problem_slug=slug,
            problem_title=title,
            language=sub.language,
            status=sub.status,
            overall_verdict=sub.overall_verdict,
            total_score=sub.total_score,
            max_time_ms=sub.max_time_ms,
            created_at=sub.created_at,
        )
        for sub, slug, title in rows
    ]


class ProblemSubmissionRow(BaseModel):
    id: UUID
    user_name: str
    user_username: str | None
    is_mine: bool
    language: Language
    status: SubmissionStatus
    overall_verdict: Verdict | None
    total_score: int
    max_time_ms: int
    created_at: datetime
    can_view_source: bool


class ProblemSubmissionsOut(BaseModel):
    viewer_passed: bool  # viewer reached 100 → may view everyone's source
    rows: list[ProblemSubmissionRow]


@router.get("/by-problem/{slug}", response_model=ProblemSubmissionsOut)
async def list_problem_submissions(
    slug: str,
    limit: int = Query(default=100, ge=1, le=300),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(current_user_not_banned),
    session: AsyncSession = Depends(get_session),
) -> ProblemSubmissionsOut:
    """Everyone's submissions for one problem. Source stays gated until the viewer full-scores."""
    problem = (await session.exec(select(Problem).where(Problem.slug == slug))).first()
    if problem is None or (not problem.is_public and user.role not in (Role.admin, Role.setter)):
        raise HTTPException(404, "problem not found")

    best = await session.get(UserProblemBest, (user.id, problem.id))
    viewer_passed = bool(best and best.best_score == 100)

    stmt = (
        select(Submission, User.name, User.username)
        .join(User, User.id == Submission.user_id)
        .where(Submission.problem_id == problem.id)
        .order_by(Submission.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.exec(stmt)).all()
    return ProblemSubmissionsOut(
        viewer_passed=viewer_passed,
        rows=[
            ProblemSubmissionRow(
                id=sub.id,
                user_name=name,
                user_username=uname,
                is_mine=sub.user_id == user.id,
                language=sub.language,
                status=sub.status,
                overall_verdict=sub.overall_verdict,
                total_score=sub.total_score,
                max_time_ms=sub.max_time_ms,
                created_at=sub.created_at,
                can_view_source=(sub.user_id == user.id) or viewer_passed,
            )
            for sub, name, uname in rows
        ],
    )


@router.get("/{sub_id}", response_model=SubmissionDetailOut)
async def get_submission(
    sub_id: UUID,
    user: User = Depends(current_user_not_banned),
    session: AsyncSession = Depends(get_session),
) -> SubmissionDetailOut:
    sub = await session.get(Submission, sub_id)
    if sub is None:
        raise HTTPException(404, "submission not found")

    is_owner = sub.user_id == user.id
    can_view = is_owner
    if not is_owner:
        best = await session.get(UserProblemBest, (user.id, sub.problem_id))
        can_view = bool(best and best.best_score == 100)

    tc_rows = (
        await session.exec(
            select(SubmissionTestcase)
            .where(SubmissionTestcase.submission_id == sub.id)
            .order_by(SubmissionTestcase.id)
        )
    ).all()
    subtask_rows = (
        await session.exec(
            select(Subtask)
            .where(Subtask.problem_id == sub.problem_id)
            .order_by(Subtask.is_sample.desc(), Subtask.ord)  # type: ignore[union-attr]
        )
    ).all()

    source_text: str | None = None
    if can_view:
        try:
            source_text = storage.read_source(sub.id, sub.language)
        except FileNotFoundError:
            source_text = None

    return SubmissionDetailOut(
        id=sub.id,
        problem_id=sub.problem_id,
        language=sub.language,
        status=sub.status,
        overall_verdict=sub.overall_verdict,
        total_score=sub.total_score,
        max_time_ms=sub.max_time_ms,
        max_memory_kb=sub.max_memory_kb,
        created_at=sub.created_at,
        can_view_source=can_view,
        compile_log=sub.compile_log,
        error_message=sub.error_message,
        subtasks=[
            SubtaskMetaOut(id=s.id, ord=s.ord, name=s.name, weight=s.weight, is_sample=s.is_sample)
            for s in subtask_rows
        ],
        testcases=[
            SubmissionTestcaseOut(
                testcase_id=r.testcase_id,
                subtask_id=r.subtask_id,
                verdict=r.verdict,
                time_ms=r.time_ms,
                memory_kb=r.memory_kb,
                score=r.score,
            )
            for r in tc_rows
        ],
        source=source_text,
    )
