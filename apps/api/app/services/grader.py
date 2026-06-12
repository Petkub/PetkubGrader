"""
Grader orchestration.

Flow:

    submit endpoint
        ├─ storage.write_source
        ├─ grader.enqueue_submission
        │     └─ for tc in problem.subtasks.testcases:
        │           judge0.submit_one(callback_url=/judge0/callback/<token>?key=…)
        │           insert SubmissionTestcase(judge0_token=token)
        └─ return Submission(status=judging)

    Judge0 webhook → routers.judge0_callback → grader.on_callback
        ├─ map status → Verdict, write back to SubmissionTestcase
        ├─ if subtask done & scoring_mode=ioi_strict & any WA → mark remaining as SKIP
        ├─ recompute Submission.total_score (aggregator)
        ├─ if all done → status=done, upsert user_problem_best
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote
from uuid import UUID

from sqlalchemy import case, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import (
    Language,
    Problem,
    ScoringMode,
    Submission,
    SubmissionStatus,
    SubmissionTestcase,
    Subtask,
    Testcase,
    UserProblemBest,
    Verdict,
)
from app.services import judge0, rate_limit, storage
from app.settings import settings

log = logging.getLogger(__name__)


# ---------- Judge0 status_id mapping ----------
# https://github.com/judge0/judge0/blob/master/docs/api/statuses.md
# 1=in queue, 2=processing, 3=AC, 4=WA, 5=TLE, 6=CE, 7..12=RE variants, 13=IE, 14=Exec fmt err
_VERDICT_BY_STATUS_ID: dict[int, Verdict] = {
    3: Verdict.ac,
    4: Verdict.wa,
    5: Verdict.tle,
    6: Verdict.ce,
    7: Verdict.re,
    8: Verdict.re,
    9: Verdict.re,
    10: Verdict.re,
    11: Verdict.re,
    12: Verdict.re,
    13: Verdict.ie,
    14: Verdict.re,
}


def _time_limit_s(problem: Problem, lang: Language) -> float:
    base_s = problem.time_ms / 1000.0
    return base_s * (problem.python_time_multiplier if lang == Language.python else 1.0)


def _callback_url(sub_id: UUID, tc_id: UUID) -> str:
    """
    Judge0 will POST here with the verdict body.
    Key in query string acts as a per-request shared secret check.
    """
    base = settings.judge0_callback_base.rstrip("/")
    key = quote(settings.api_internal_key)
    return f"{base}/judge0/callback?sub={sub_id}&tc={tc_id}&key={key}"


async def _load_testcases(session: AsyncSession, problem_id: UUID) -> list[tuple[Subtask, Testcase]]:
    """Return [(subtask, testcase), ...] sorted by (subtask.ord, testcase.ord)."""
    subtasks = list(
        (
            await session.exec(
                select(Subtask).where(Subtask.problem_id == problem_id).order_by(Subtask.ord)
            )
        ).all()
    )
    out: list[tuple[Subtask, Testcase]] = []
    for st in subtasks:
        cases = (
            await session.exec(
                select(Testcase).where(Testcase.subtask_id == st.id).order_by(Testcase.ord)
            )
        ).all()
        for tc in cases:
            out.append((st, tc))
    return out


async def enqueue_submission(session: AsyncSession, sub: Submission, source: str) -> None:
    """Persist source, fan out one Judge0 submission per testcase."""
    storage.write_source(sub.id, sub.language, source)

    problem = await session.get(Problem, sub.problem_id)
    if problem is None:
        sub.status = SubmissionStatus.error
        sub.error_message = "problem not found"
        await session.commit()
        await rate_limit.release_slot(sub.user_id)
        return

    pairs = await _load_testcases(session, problem.id)
    if not pairs:
        sub.status = SubmissionStatus.error
        sub.error_message = "no testcases"
        await session.commit()
        await rate_limit.release_slot(sub.user_id)
        return

    tl_s = _time_limit_s(problem, sub.language)
    mem_kb = problem.memory_mb * 1024
    sub.status = SubmissionStatus.judging

    # Create + COMMIT all testcase rows BEFORE dispatching to Judge0.
    # Judge0 is fast (~300ms) and its callback runs in a separate session —
    # if a row isn't committed when the callback arrives, the verdict is lost
    # and the submission hangs. Commit first, dispatch second.
    rows: list[tuple[SubmissionTestcase, Testcase]] = []
    for subtask, tc in pairs:
        row = SubmissionTestcase(submission_id=sub.id, testcase_id=tc.id, subtask_id=subtask.id)
        session.add(row)
        rows.append((row, tc))
    await session.commit()

    for row, tc in rows:
        try:
            token = await judge0.submit_one(
                source=source,
                language=sub.language,
                stdin=storage.testcase_input(tc),
                expected=storage.testcase_expected(tc),
                cpu_time_limit_s=tl_s,
                memory_limit_kb=mem_kb,
                callback_url=_callback_url(sub.id, tc.id),
            )
            row.judge0_token = token
        except Exception as e:
            log.exception("judge0 submit failed")
            row.verdict = Verdict.ie
            row.stderr_excerpt = f"judge0 dispatch failed: {e}"
        await session.commit()


# ---------- Callback handler ----------


async def on_callback(
    session: AsyncSession,
    sub_id: UUID,
    tc_id: UUID,
    payload: dict[str, Any],
) -> None:
    """Judge0 POSTed a verdict for one testcase. Update + aggregate.

    Judge0 fires all per-testcase callbacks near-simultaneously. Each runs in its
    own transaction, so without serialization no single callback's snapshot sees
    every sibling verdict committed — and none would trigger finalization.
    Lock the Submission row FOR UPDATE first: callbacks for the same submission
    serialize, and the last one observes all verdicts and finalizes.
    """
    sub = (
        await session.exec(
            select(Submission).where(Submission.id == sub_id).with_for_update()
        )
    ).first()
    if sub is None:
        log.warning("callback for unknown submission %s", sub_id)
        return

    row = (
        await session.exec(
            select(SubmissionTestcase)
            .where(SubmissionTestcase.submission_id == sub_id)
            .where(SubmissionTestcase.testcase_id == tc_id)
        )
    ).first()
    if row is None:
        log.warning("callback for unknown submission_testcase sub=%s tc=%s", sub_id, tc_id)
        return
    if row.verdict is not None and row.verdict != Verdict.skipped:
        return  # duplicate callback — ignore

    status_id = (payload.get("status") or {}).get("id")
    row.verdict = _VERDICT_BY_STATUS_ID.get(status_id, Verdict.ie)
    row.time_ms = int(float(payload.get("time") or 0) * 1000) if payload.get("time") else None
    row.memory_kb = payload.get("memory")
    row.score = 100 if row.verdict == Verdict.ac else 0

    stderr = payload.get("stderr")
    if stderr:
        row.stderr_excerpt = (stderr or "")[:4000]

    compile_output = payload.get("compile_output")
    if compile_output and not sub.compile_log:
        sub.compile_log = compile_output[:8000]

    await session.flush()

    await _maybe_short_circuit_subtask(session, sub, row.subtask_id)
    await _recompute_submission(session, sub)
    await session.commit()  # releases the FOR UPDATE lock


# ---------- Aggregation helpers ----------


async def _maybe_short_circuit_subtask(
    session: AsyncSession, sub: Submission, subtask_id: UUID
) -> None:
    """In ioi_strict mode, mark remaining cases of a failing subtask as SKIP."""
    problem = await session.get(Problem, sub.problem_id)
    if problem is None or problem.scoring_mode != ScoringMode.ioi_strict:
        return

    rows = (
        await session.exec(
            select(SubmissionTestcase)
            .where(SubmissionTestcase.submission_id == sub.id)
            .where(SubmissionTestcase.subtask_id == subtask_id)
        )
    ).all()
    if any(r.verdict is not None and r.verdict not in (Verdict.ac, Verdict.skipped) for r in rows):
        for r in rows:
            if r.verdict is None:
                r.verdict = Verdict.skipped
                r.score = 0


async def _recompute_submission(session: AsyncSession, sub: Submission) -> None:
    """Sum subtask scores from current per-testcase rows. Finalize if all done."""
    problem = await session.get(Problem, sub.problem_id)
    if problem is None:
        return

    subtasks = (
        await session.exec(select(Subtask).where(Subtask.problem_id == problem.id))
    ).all()
    rows = (
        await session.exec(
            select(SubmissionTestcase).where(SubmissionTestcase.submission_id == sub.id)
        )
    ).all()

    by_subtask: dict[UUID, list[SubmissionTestcase]] = {}
    for r in rows:
        by_subtask.setdefault(r.subtask_id, []).append(r)

    total = 0
    max_time = 0
    max_mem = 0
    overall_verdict: Verdict | None = Verdict.ac
    all_finalized = True

    for st in subtasks:
        st_rows = by_subtask.get(st.id, [])
        if not st_rows:
            all_finalized = False
            continue
        if any(r.verdict is None for r in st_rows):
            all_finalized = False

        finalized_rows = [r for r in st_rows if r.verdict is not None]
        passed = sum(1 for r in finalized_rows if r.verdict == Verdict.ac)
        total_cases = len(st_rows)

        if problem.scoring_mode == ScoringMode.ioi_strict:
            if all(r.verdict == Verdict.ac for r in st_rows):
                total += st.weight
        else:  # partial
            if total_cases > 0:
                total += int(round(st.weight * passed / total_cases))

        for r in finalized_rows:
            if r.time_ms:
                max_time = max(max_time, r.time_ms)
            if r.memory_kb:
                max_mem = max(max_mem, r.memory_kb)
            if r.verdict not in (Verdict.ac, Verdict.skipped) and overall_verdict == Verdict.ac:
                overall_verdict = r.verdict

    sub.total_score = min(total, 100)
    sub.max_time_ms = max_time
    sub.max_memory_kb = max_mem

    if all_finalized:
        sub.status = SubmissionStatus.done
        sub.overall_verdict = overall_verdict if overall_verdict else Verdict.ac
        sub.judged_at = datetime.now(tz=timezone.utc)
        await _upsert_best(session, sub)
        await rate_limit.release_slot(sub.user_id)


async def _upsert_best(session: AsyncSession, sub: Submission) -> None:
    """Update user_problem_best on completion. Set first_full_score_at when first hitting 100."""
    now = datetime.now(tz=timezone.utc)
    stmt = (
        pg_insert(UserProblemBest)
        .values(
            user_id=sub.user_id,
            problem_id=sub.problem_id,
            best_score=sub.total_score,
            first_full_score_at=now if sub.total_score == 100 else None,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "problem_id"],
            set_={
                "best_score": func.greatest(UserProblemBest.best_score, sub.total_score),
                "first_full_score_at": case(
                    (
                        UserProblemBest.first_full_score_at.is_(None)
                        & (sub.total_score == 100),
                        now,
                    ),
                    else_=UserProblemBest.first_full_score_at,
                ),
            },
        )
    )
    await session.execute(stmt)
