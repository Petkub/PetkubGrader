"""
File layout on the bind-mounted data volume:

    /data/testcases/<problem_id>/<testcase_id>.in
    /data/testcases/<problem_id>/<testcase_id>.ans
    /data/submissions/<submission_id>/source.cpp|py
"""

from __future__ import annotations

import shutil
from pathlib import Path
from uuid import UUID

from app.models import Language, Testcase
from app.settings import settings

_SOURCE_EXT = {Language.cpp: "cpp", Language.python: "py"}


def submission_dir(sub_id: UUID) -> Path:
    p = Path(settings.submission_dir) / str(sub_id)
    p.mkdir(parents=True, exist_ok=True)
    return p


def write_source(sub_id: UUID, language: Language, source: str) -> Path:
    path = submission_dir(sub_id) / f"source.{_SOURCE_EXT[language]}"
    path.write_text(source, encoding="utf-8")
    return path


def read_source(sub_id: UUID, language: Language) -> str:
    path = submission_dir(sub_id) / f"source.{_SOURCE_EXT[language]}"
    return path.read_text(encoding="utf-8")


def testcase_input(tc: Testcase) -> bytes:
    return (Path(settings.testcase_dir) / tc.input_path).read_bytes()


def testcase_expected(tc: Testcase) -> bytes:
    return (Path(settings.testcase_dir) / tc.expected_path).read_bytes()


def problem_testcase_dir(problem_id: UUID) -> Path:
    return Path(settings.testcase_dir) / str(problem_id)


def clear_problem_testcases(problem_id: UUID) -> None:
    """Wipe a problem's testcase dir before re-uploading a package."""
    d = problem_testcase_dir(problem_id)
    if d.exists():
        shutil.rmtree(d)


def delete_testcase_files(problem_id: UUID, testcase_id: UUID) -> None:
    d = problem_testcase_dir(problem_id)
    (d / f"{testcase_id}.in").unlink(missing_ok=True)
    (d / f"{testcase_id}.ans").unlink(missing_ok=True)


def write_testcase_files(
    problem_id: UUID, testcase_id: UUID, input_bytes: bytes, expected_bytes: bytes
) -> tuple[str, str]:
    """Write .in/.ans, return (input_path, expected_path) relative to testcase_dir."""
    d = problem_testcase_dir(problem_id)
    d.mkdir(parents=True, exist_ok=True)
    in_rel = f"{problem_id}/{testcase_id}.in"
    ans_rel = f"{problem_id}/{testcase_id}.ans"
    (d / f"{testcase_id}.in").write_bytes(input_bytes)
    (d / f"{testcase_id}.ans").write_bytes(expected_bytes)
    return in_rel, ans_rel
