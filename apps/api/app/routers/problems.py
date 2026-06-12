from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import delete, select

from app.db import get_session
from app.deps import current_user_not_banned, require_setter
from app.models import (
    AuditLog,
    Problem,
    ProblemTopic,
    Role,
    ScoringMode,
    Subtask,
    Testcase,
    Topic,
    User,
    UserProblemBest,
)
from app.services import contest as contest_svc
from app.services import package, storage

router = APIRouter(prefix="/problems", tags=["problems"])


class TopicOut(BaseModel):
    id: UUID
    slug: str
    name: str


class ProblemSummary(BaseModel):
    id: UUID
    slug: str
    title: str
    time_ms: int
    memory_mb: int
    scoring_mode: ScoringMode
    is_public: bool
    topics: list[TopicOut]
    your_best_score: int = 0


class SampleOut(BaseModel):
    input: str
    output: str
    explanation: str | None


class ProblemDetail(ProblemSummary):
    statement_md: str
    input_format_md: str
    output_format_md: str
    constraints_md: str
    samples: list[SampleOut] = []


class ProblemCreateIn(BaseModel):
    slug: str
    title: str
    statement_md: str = ""
    input_format_md: str = ""
    output_format_md: str = ""
    constraints_md: str = ""
    time_ms: int = 1000
    memory_mb: int = 256
    scoring_mode: ScoringMode = ScoringMode.ioi_strict
    topic_slugs: list[str] = []


class ProblemUpdateIn(BaseModel):
    title: str | None = None
    statement_md: str | None = None
    input_format_md: str | None = None
    output_format_md: str | None = None
    constraints_md: str | None = None
    time_ms: int | None = None
    memory_mb: int | None = None
    scoring_mode: ScoringMode | None = None
    topic_slugs: list[str] | None = None


@router.get("", response_model=list[ProblemSummary])
async def list_problems(
    q: str | None = Query(default=None, description="full-text query"),
    topic: list[str] | None = Query(default=None, description="topic slugs, AND-matched"),
    include_drafts: bool = Query(default=False, description="setters/admins only"),
    user: User = Depends(current_user_not_banned),
    session: AsyncSession = Depends(get_session),
) -> list[ProblemSummary]:
    can_see_drafts = user.role in (Role.admin, Role.setter)
    stmt = select(Problem)
    if not (include_drafts and can_see_drafts):
        stmt = stmt.where(Problem.is_public.is_(True))  # type: ignore[union-attr]

    if q:
        # Prefix match (front-to-back): title or slug must START with the query.
        like = f"{q.strip()}%"
        stmt = stmt.where(Problem.title.ilike(like) | Problem.slug.ilike(like))  # type: ignore[union-attr]

    if topic:
        # subquery: problems that have ALL requested topics
        topic_subq = (
            select(ProblemTopic.problem_id)
            .join(Topic, Topic.id == ProblemTopic.topic_id)
            .where(Topic.slug.in_(topic))
            .group_by(ProblemTopic.problem_id)
            .having(func.count(ProblemTopic.topic_id.distinct()) == len(topic))
        )
        stmt = stmt.where(Problem.id.in_(topic_subq))  # type: ignore[union-attr]

    problems = (await session.exec(stmt.order_by(Problem.created_at.desc()))).all()

    # Hydrate topics + your-best-score per problem.
    out: list[ProblemSummary] = []
    for p in problems:
        topic_rows = (
            await session.exec(
                select(Topic)
                .join(ProblemTopic, ProblemTopic.topic_id == Topic.id)
                .where(ProblemTopic.problem_id == p.id)
            )
        ).all()
        best = await session.get(UserProblemBest, (user.id, p.id))
        out.append(
            ProblemSummary(
                id=p.id,
                slug=p.slug,
                title=p.title,
                time_ms=p.time_ms,
                memory_mb=p.memory_mb,
                scoring_mode=p.scoring_mode,
                is_public=p.is_public,
                topics=[TopicOut(id=t.id, slug=t.slug, name=t.name) for t in topic_rows],
                your_best_score=best.best_score if best else 0,
            )
        )
    return out


@router.get("/{slug}", response_model=ProblemDetail)
async def get_problem(
    slug: str,
    user: User = Depends(current_user_not_banned),
    session: AsyncSession = Depends(get_session),
) -> ProblemDetail:
    p = (await session.exec(select(Problem).where(Problem.slug == slug))).first()
    if p is None or not await contest_svc.user_can_access_problem(session, user, p):
        raise HTTPException(404, "problem not found")

    topic_rows = (
        await session.exec(
            select(Topic)
            .join(ProblemTopic, ProblemTopic.topic_id == Topic.id)
            .where(ProblemTopic.problem_id == p.id)
        )
    ).all()
    best = await session.get(UserProblemBest, (user.id, p.id))

    # Public samples: read the sample subtask's testcases (small, inline content).
    samples: list[SampleOut] = []
    sample_st = (
        await session.exec(
            select(Subtask).where(Subtask.problem_id == p.id, Subtask.is_sample.is_(True))  # type: ignore[union-attr]
        )
    ).first()
    if sample_st is not None:
        sample_tcs = (
            await session.exec(
                select(Testcase).where(Testcase.subtask_id == sample_st.id).order_by(Testcase.ord)
            )
        ).all()
        for tc in sample_tcs:
            try:
                samples.append(
                    SampleOut(
                        input=storage.testcase_input(tc).decode("utf-8", "replace"),
                        output=storage.testcase_expected(tc).decode("utf-8", "replace"),
                        explanation=tc.explanation,
                    )
                )
            except FileNotFoundError:
                continue

    return ProblemDetail(
        id=p.id,
        slug=p.slug,
        title=p.title,
        time_ms=p.time_ms,
        memory_mb=p.memory_mb,
        scoring_mode=p.scoring_mode,
        is_public=p.is_public,
        topics=[TopicOut(id=t.id, slug=t.slug, name=t.name) for t in topic_rows],
        your_best_score=best.best_score if best else 0,
        statement_md=p.statement_md,
        input_format_md=p.input_format_md,
        output_format_md=p.output_format_md,
        constraints_md=p.constraints_md,
        samples=samples,
    )


@router.post("", response_model=ProblemDetail, status_code=201)
async def create_problem(
    payload: ProblemCreateIn,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ProblemDetail:
    p = Problem(
        slug=payload.slug,
        title=payload.title,
        statement_md=payload.statement_md,
        input_format_md=payload.input_format_md,
        output_format_md=payload.output_format_md,
        constraints_md=payload.constraints_md,
        time_ms=payload.time_ms,
        memory_mb=payload.memory_mb,
        scoring_mode=payload.scoring_mode,
        is_public=False,
        created_by_id=setter.id,
    )
    session.add(p)
    await session.flush()

    # attach topics
    for slug in payload.topic_slugs:
        t = (await session.exec(select(Topic).where(Topic.slug == slug))).first()
        if t is None:
            raise HTTPException(400, f"unknown topic: {slug}")
        session.add(ProblemTopic(problem_id=p.id, topic_id=t.id))

    await session.commit()
    await session.refresh(p)
    return await get_problem(p.slug, setter, session)


class UploadResult(BaseModel):
    problem_slug: str
    subtasks: int
    testcases: int
    scoring_mode: ScoringMode
    time_ms: int
    memory_mb: int


MAX_PACKAGE_BYTES = 200 * 1024 * 1024  # 200 MB


@router.post("/{slug}/testcases", response_model=UploadResult)
async def upload_testcases(
    slug: str,
    file: UploadFile = File(...),
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> UploadResult:
    """Upload a problem package ZIP. Replaces all subtasks + testcases for the problem."""
    problem = (await session.exec(select(Problem).where(Problem.slug == slug))).first()
    if problem is None:
        raise HTTPException(404, "problem not found")

    raw = await file.read()
    if len(raw) > MAX_PACKAGE_BYTES:
        raise HTTPException(413, "package too large (max 200 MB)")

    try:
        pkg = package.parse_package(raw)
    except package.PackageError as e:
        raise HTTPException(400, str(e)) from e

    # Replace: delete existing subtasks (testcases cascade) + wipe files on disk.
    old_subtasks = (
        await session.exec(select(Subtask.id).where(Subtask.problem_id == problem.id))
    ).all()
    if old_subtasks:
        await session.exec(
            delete(Testcase).where(Testcase.subtask_id.in_(old_subtasks))  # type: ignore[attr-defined]
        )
        await session.exec(delete(Subtask).where(Subtask.problem_id == problem.id))
    storage.clear_problem_testcases(problem.id)

    # Apply config-level limits.
    problem.time_ms = pkg.config.time_ms
    problem.memory_mb = pkg.config.memory_mb
    problem.scoring_mode = pkg.config.scoring_mode
    problem.python_time_multiplier = pkg.config.python_time_multiplier

    n_tc = 0
    for ps in pkg.subtasks:
        st = Subtask(
            problem_id=problem.id, ord=ps.ord, name=ps.name, weight=ps.weight, is_sample=ps.is_sample
        )
        session.add(st)
        await session.flush()
        for i, ptc in enumerate(ps.testcases):
            tc = Testcase(
                subtask_id=st.id, ord=i, input_path="", expected_path="", explanation=ptc.explanation
            )
            session.add(tc)
            await session.flush()
            in_rel, ans_rel = storage.write_testcase_files(
                problem.id, tc.id, ptc.input_bytes, ptc.expected_bytes
            )
            tc.input_path = in_rel
            tc.expected_path = ans_rel
            tc.size_in_bytes = len(ptc.input_bytes)
            tc.size_out_bytes = len(ptc.expected_bytes)
            n_tc += 1

    await session.commit()
    return UploadResult(
        problem_slug=problem.slug,
        subtasks=len(pkg.subtasks),
        testcases=n_tc,
        scoring_mode=problem.scoring_mode,
        time_ms=problem.time_ms,
        memory_mb=problem.memory_mb,
    )


class SampleIn(BaseModel):
    input: str
    output: str
    explanation: str = ""


class SamplesIn(BaseModel):
    samples: list[SampleIn]


@router.put("/{slug}/samples", response_model=ProblemDetail)
async def set_samples(
    slug: str,
    payload: SamplesIn,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ProblemDetail:
    """Replace just the sample subtask (UI editor). Leaves scored subtasks untouched."""
    p = (await session.exec(select(Problem).where(Problem.slug == slug))).first()
    if p is None:
        raise HTTPException(404, "problem not found")

    subtasks = (await session.exec(select(Subtask).where(Subtask.problem_id == p.id))).all()

    # Remove the existing sample subtask + its files.
    for st in subtasks:
        if st.is_sample:
            old_tcs = (
                await session.exec(select(Testcase).where(Testcase.subtask_id == st.id))
            ).all()
            for tc in old_tcs:
                storage.delete_testcase_files(p.id, tc.id)
            await session.exec(delete(Testcase).where(Testcase.subtask_id == st.id))
            await session.exec(delete(Subtask).where(Subtask.id == st.id))

    if payload.samples:
        # Pick a free ord (display orders samples-first, so the number only needs to be unique).
        max_ord = max((s.ord for s in subtasks if not s.is_sample), default=-1)
        st = Subtask(
            problem_id=p.id, ord=max_ord + 1, name="Samples", weight=0, is_sample=True
        )
        session.add(st)
        await session.flush()
        for i, s in enumerate(payload.samples):
            tc = Testcase(
                subtask_id=st.id, ord=i, input_path="", expected_path="",
                explanation=s.explanation or None,
            )
            session.add(tc)
            await session.flush()
            in_b, out_b = s.input.encode(), s.output.encode()
            in_rel, ans_rel = storage.write_testcase_files(p.id, tc.id, in_b, out_b)
            tc.input_path, tc.expected_path = in_rel, ans_rel
            tc.size_in_bytes, tc.size_out_bytes = len(in_b), len(out_b)

    await session.commit()
    return await get_problem(p.slug, setter, session)


@router.patch("/{slug}", response_model=ProblemDetail)
async def update_problem(
    slug: str,
    payload: ProblemUpdateIn,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ProblemDetail:
    p = (await session.exec(select(Problem).where(Problem.slug == slug))).first()
    if p is None:
        raise HTTPException(404, "problem not found")

    data = payload.model_dump(exclude_unset=True)
    topic_slugs = data.pop("topic_slugs", None)
    for field, value in data.items():
        setattr(p, field, value)

    if topic_slugs is not None:
        await session.exec(delete(ProblemTopic).where(ProblemTopic.problem_id == p.id))
        for ts in topic_slugs:
            t = (await session.exec(select(Topic).where(Topic.slug == ts))).first()
            if t is None:
                raise HTTPException(400, f"unknown topic: {ts}")
            session.add(ProblemTopic(problem_id=p.id, topic_id=t.id))

    await session.commit()
    return await get_problem(p.slug, setter, session)


async def _validate_publishable(session: AsyncSession, problem_id: UUID) -> None:
    """Publishable iff scored (non-sample) subtasks sum to 100 and each is non-empty."""
    subtasks = (
        await session.exec(select(Subtask).where(Subtask.problem_id == problem_id))
    ).all()
    scored = [s for s in subtasks if not s.is_sample]
    if not scored:
        raise HTTPException(400, "cannot publish: no scored subtasks (upload a testcase package first)")
    if sum(s.weight for s in scored) != 100:
        raise HTTPException(400, "cannot publish: scored subtask weights must sum to 100")
    for st in subtasks:
        n = (
            await session.exec(
                select(func.count()).select_from(Testcase).where(Testcase.subtask_id == st.id)
            )
        ).one()
        if n == 0:
            raise HTTPException(400, f"cannot publish: subtask '{st.name}' has no testcases")


@router.post("/{slug}/publish", response_model=ProblemDetail)
async def publish_problem(
    slug: str,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ProblemDetail:
    p = (await session.exec(select(Problem).where(Problem.slug == slug))).first()
    if p is None:
        raise HTTPException(404, "problem not found")
    await _validate_publishable(session, p.id)
    p.is_public = True
    session.add(AuditLog(actor_id=setter.id, action="problem.publish", target_kind="problem", target_id=str(p.id)))
    await session.commit()
    return await get_problem(p.slug, setter, session)


@router.post("/{slug}/unpublish", response_model=ProblemDetail)
async def unpublish_problem(
    slug: str,
    setter: User = Depends(require_setter),
    session: AsyncSession = Depends(get_session),
) -> ProblemDetail:
    p = (await session.exec(select(Problem).where(Problem.slug == slug))).first()
    if p is None:
        raise HTTPException(404, "problem not found")
    p.is_public = False
    session.add(AuditLog(actor_id=setter.id, action="problem.unpublish", target_kind="problem", target_id=str(p.id)))
    await session.commit()
    return await get_problem(p.slug, setter, session)
