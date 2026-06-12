"""
MyGrader DB schema.

Conventions:
- All ids = UUID v4. Stored as native uuid.
- All timestamps = timezone-aware UTC.
- All FK on delete cascades for child rows; sets null for soft links (e.g. created_by).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, Index, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, TSVECTOR
from sqlmodel import Field, Relationship, SQLModel


# --------------- Enums ---------------

class Role(str, Enum):
    admin = "admin"
    setter = "setter"
    member = "member"


class UserStatus(str, Enum):
    pending = "pending"   # signed up, waiting admin approval
    approved = "approved"
    banned = "banned"


class ScoringMode(str, Enum):
    ioi_strict = "ioi_strict"  # subtask all-or-nothing
    partial = "partial"        # subtask = (passed / total) * weight


class Language(str, Enum):
    cpp = "cpp"
    python = "python"


class ContestMode(str, Enum):
    live = "live"          # global start, fixed window
    virtual = "virtual"    # per-user start


class SubmissionStatus(str, Enum):
    queued = "queued"
    judging = "judging"
    done = "done"
    error = "error"


class Verdict(str, Enum):
    ac = "AC"        # Accepted
    wa = "WA"        # Wrong Answer
    tle = "TLE"      # Time Limit Exceeded
    mle = "MLE"      # Memory Limit Exceeded
    re = "RE"        # Runtime Error
    ce = "CE"        # Compile Error
    ie = "IE"        # Internal Error
    skipped = "SKIP"  # skipped (subtask short-circuit in ioi_strict)


# --------------- Helpers ---------------

def _ts_default() -> Column:
    return Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)


def _ts_updated() -> Column:
    return Column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=text("now()"),
        nullable=False,
    )


def _ts_nullable() -> Column:
    return Column(DateTime(timezone=True), nullable=True)


# --------------- Users ---------------

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(sa_column=Column(CITEXT, unique=True, nullable=False))
    name: str = Field(max_length=80)
    username: str | None = Field(default=None, sa_column=Column(CITEXT, unique=True, nullable=True))
    school: str | None = Field(default=None, max_length=120)
    image_url: str | None = None
    role: Role = Field(default=Role.member, index=True)
    status: UserStatus = Field(default=UserStatus.pending, index=True)
    created_at: datetime = Field(sa_column=_ts_default())
    approved_at: datetime | None = Field(default=None, sa_column=_ts_nullable())
    approved_by_id: UUID | None = Field(default=None, foreign_key="users.id", ondelete="SET NULL")


# --------------- Topics ---------------

class Topic(SQLModel, table=True):
    __tablename__ = "topics"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    slug: str = Field(unique=True, max_length=64)
    name: str = Field(max_length=80)


class ProblemTopic(SQLModel, table=True):
    __tablename__ = "problem_topics"

    problem_id: UUID = Field(foreign_key="problems.id", primary_key=True, ondelete="CASCADE")
    topic_id: UUID = Field(foreign_key="topics.id", primary_key=True, ondelete="CASCADE")


# --------------- Problems ---------------

class Problem(SQLModel, table=True):
    __tablename__ = "problems"
    __table_args__ = (
        Index("ix_problems_search", "search_vector", postgresql_using="gin"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    slug: str = Field(unique=True, max_length=80, index=True)
    title: str = Field(max_length=200)
    statement_md: str = Field(default="")
    input_format_md: str = Field(default="")
    output_format_md: str = Field(default="")
    constraints_md: str = Field(default="")

    time_ms: int = Field(default=1000, ge=100, le=15000)
    memory_mb: int = Field(default=256, ge=16, le=1024)
    scoring_mode: ScoringMode = Field(default=ScoringMode.ioi_strict)
    python_time_multiplier: float = Field(default=3.0)

    is_public: bool = Field(default=False, index=True)
    created_by_id: UUID | None = Field(
        default=None, foreign_key="users.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(sa_column=_ts_default())
    updated_at: datetime = Field(sa_column=_ts_updated())

    # Maintained by trigger.
    search_vector: str | None = Field(
        default=None, sa_column=Column(TSVECTOR, nullable=True)
    )


class Subtask(SQLModel, table=True):
    __tablename__ = "subtasks"
    __table_args__ = (UniqueConstraint("problem_id", "ord"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    problem_id: UUID = Field(foreign_key="problems.id", index=True, ondelete="CASCADE")
    ord: int = Field(ge=0)
    name: str = Field(max_length=120)
    weight: int = Field(ge=0, le=100)  # non-sample weights per problem == 100
    is_sample: bool = Field(default=False)  # sample subtask: public IO, 0 points


class Testcase(SQLModel, table=True):
    __tablename__ = "testcases"
    __table_args__ = (UniqueConstraint("subtask_id", "ord"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    subtask_id: UUID = Field(foreign_key="subtasks.id", index=True, ondelete="CASCADE")
    ord: int = Field(ge=0)
    input_path: str  # relative to TESTCASE_DIR
    expected_path: str
    size_in_bytes: int = Field(default=0)
    size_out_bytes: int = Field(default=0)
    explanation: str | None = None  # sample-only: shown publicly on the problem page


# --------------- Contests ---------------

class Contest(SQLModel, table=True):
    __tablename__ = "contests"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    slug: str = Field(unique=True, max_length=80)
    title: str = Field(max_length=200)
    description_md: str = Field(default="")
    mode: ContestMode = Field(default=ContestMode.virtual)
    start_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    duration_min: int = Field(ge=1)
    freeze_last_min: int = Field(default=0, ge=0)
    is_published: bool = Field(default=False)
    created_by_id: UUID | None = Field(
        default=None, foreign_key="users.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(sa_column=_ts_default())


class ContestProblem(SQLModel, table=True):
    __tablename__ = "contest_problems"
    __table_args__ = (
        UniqueConstraint("contest_id", "ord"),
        UniqueConstraint("contest_id", "problem_id"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    contest_id: UUID = Field(foreign_key="contests.id", index=True, ondelete="CASCADE")
    problem_id: UUID = Field(foreign_key="problems.id", ondelete="CASCADE")
    ord: int = Field(ge=0)
    alias: str = Field(max_length=8)  # e.g. "A", "B"


class ContestParticipant(SQLModel, table=True):
    __tablename__ = "contest_participants"
    __table_args__ = (UniqueConstraint("contest_id", "user_id"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    contest_id: UUID = Field(foreign_key="contests.id", index=True, ondelete="CASCADE")
    user_id: UUID = Field(foreign_key="users.id", index=True, ondelete="CASCADE")
    started_at: datetime | None = Field(default=None, sa_column=_ts_nullable())  # virtual start
    finished_at: datetime | None = Field(default=None, sa_column=_ts_nullable())


# --------------- Submissions ---------------

class Submission(SQLModel, table=True):
    __tablename__ = "submissions"
    __table_args__ = (
        Index("ix_submissions_user_problem", "user_id", "problem_id"),
        Index("ix_submissions_created", "created_at"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    problem_id: UUID = Field(foreign_key="problems.id", ondelete="CASCADE")
    contest_id: UUID | None = Field(
        default=None, foreign_key="contests.id", ondelete="SET NULL"
    )
    language: Language
    source_path: str  # path under SUBMISSION_DIR
    source_size: int = Field(default=0)
    status: SubmissionStatus = Field(default=SubmissionStatus.queued, index=True)
    overall_verdict: Verdict | None = None
    total_score: int = Field(default=0, ge=0, le=100)
    max_time_ms: int = Field(default=0)
    max_memory_kb: int = Field(default=0)
    compile_log: str | None = None
    error_message: str | None = None
    created_at: datetime = Field(sa_column=_ts_default())
    judged_at: datetime | None = Field(default=None, sa_column=_ts_nullable())


class SubmissionTestcase(SQLModel, table=True):
    __tablename__ = "submission_testcases"
    __table_args__ = (UniqueConstraint("submission_id", "testcase_id"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    submission_id: UUID = Field(foreign_key="submissions.id", index=True, ondelete="CASCADE")
    testcase_id: UUID = Field(foreign_key="testcases.id", ondelete="CASCADE")
    subtask_id: UUID = Field(foreign_key="subtasks.id", ondelete="CASCADE")
    judge0_token: str | None = None
    verdict: Verdict | None = None
    time_ms: int | None = None
    memory_kb: int | None = None
    score: int = Field(default=0)  # 0 or 100 (per-testcase)
    stderr_excerpt: str | None = None


# --------------- Ranking (denorm) ---------------

class UserProblemBest(SQLModel, table=True):
    """
    Denormalized: user's best score per problem.
    Updated by trigger/app code on submission completion.
    Ranking source-of-truth for the global leaderboard.
    """

    __tablename__ = "user_problem_best"

    user_id: UUID = Field(foreign_key="users.id", primary_key=True, ondelete="CASCADE")
    problem_id: UUID = Field(foreign_key="problems.id", primary_key=True, ondelete="CASCADE")
    best_score: int = Field(default=0, ge=0, le=100)
    first_full_score_at: datetime | None = Field(default=None, sa_column=_ts_nullable())
    updated_at: datetime = Field(sa_column=_ts_updated())


# --------------- Audit ---------------

class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    actor_id: UUID | None = Field(default=None, foreign_key="users.id", ondelete="SET NULL")
    action: str = Field(max_length=64)  # e.g. "user.approve", "problem.publish"
    target_kind: str = Field(max_length=32)
    target_id: str = Field(max_length=64)
    meta: dict | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime = Field(sa_column=_ts_default())
