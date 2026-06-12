"""
Problem package (ZIP) parsing + validation.

Expected layout:

    config.yaml
    tests/
      1.in
      1.out
      2.in
      2.out
      ...

config.yaml:

    time_ms: 1000
    memory_mb: 256
    scoring_mode: ioi_strict      # or: partial
    python_time_multiplier: 3.0   # optional, default 3.0
    subtasks:
      - name: "n <= 100"
        weight: 30
        tests: [1, 2, 3]
      - name: "n <= 1e5"
        weight: 70
        tests: [4, 5, 6, 7, 8]

Test files matched by basename, so `tests/1.in` and `1.in` both work.
Expected-output file may be `N.out` or `N.ans`.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import PurePosixPath

import yaml
from pydantic import BaseModel, Field, field_validator

from app.models import ScoringMode


class SubtaskSpec(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    weight: int = Field(ge=0, le=100)
    tests: list[int] = Field(min_length=1)


class SampleSpec(BaseModel):
    # `in`/`out` are inline strings (samples are small). `in` is a Python keyword → alias.
    model_config = {"populate_by_name": True}
    input: str = Field(alias="in")
    output: str = Field(alias="out")
    explanation: str = ""


class PackageConfig(BaseModel):
    time_ms: int = Field(default=1000, ge=100, le=15000)
    memory_mb: int = Field(default=256, ge=16, le=1024)
    scoring_mode: ScoringMode = ScoringMode.ioi_strict
    python_time_multiplier: float = Field(default=3.0, ge=1.0, le=10.0)
    samples: list[SampleSpec] = Field(default_factory=list)
    subtasks: list[SubtaskSpec] = Field(min_length=1)

    @field_validator("subtasks")
    @classmethod
    def _weights_sum_100(cls, v: list[SubtaskSpec]) -> list[SubtaskSpec]:
        total = sum(s.weight for s in v)
        if total != 100:
            raise ValueError(f"subtask weights must sum to 100, got {total}")
        return v


class ParsedTestcase(BaseModel):
    number: int
    input_bytes: bytes
    expected_bytes: bytes
    explanation: str | None = None


class ParsedSubtask(BaseModel):
    name: str
    weight: int
    ord: int
    is_sample: bool = False
    testcases: list[ParsedTestcase]


class ParsedPackage(BaseModel):
    config: PackageConfig
    subtasks: list[ParsedSubtask]


class PackageError(ValueError):
    """Raised for any malformed package — surfaced to the client as 400."""


def parse_package(raw: bytes) -> ParsedPackage:
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as e:
        raise PackageError("not a valid zip file") from e

    # index entries by basename
    by_basename: dict[str, str] = {}
    config_name: str | None = None
    for name in zf.namelist():
        if name.endswith("/"):
            continue
        base = PurePosixPath(name).name
        if base == "config.yaml":
            config_name = name
            continue
        by_basename[base] = name

    if config_name is None:
        raise PackageError("config.yaml missing from zip root")

    try:
        cfg_raw = yaml.safe_load(zf.read(config_name))
    except yaml.YAMLError as e:
        raise PackageError(f"config.yaml is not valid YAML: {e}") from e
    try:
        config = PackageConfig.model_validate(cfg_raw)
    except Exception as e:  # pydantic ValidationError
        raise PackageError(f"config.yaml invalid: {e}") from e

    parsed_subtasks: list[ParsedSubtask] = []

    # Sample subtask first (ord 0, weight 0). Samples are inline in config + public.
    if config.samples:
        sample_cases = [
            ParsedTestcase(
                number=-(i + 1),
                input_bytes=s.input.encode(),
                expected_bytes=s.output.encode(),
                explanation=s.explanation or None,
            )
            for i, s in enumerate(config.samples)
        ]
        parsed_subtasks.append(
            ParsedSubtask(name="Samples", weight=0, ord=0, is_sample=True, testcases=sample_cases)
        )

    # Real (scored) subtasks. ord offset by 1 if a sample subtask exists.
    offset = 1 if config.samples else 0
    seen_numbers: set[int] = set()
    for idx, spec in enumerate(config.subtasks):
        cases: list[ParsedTestcase] = []
        for n in spec.tests:
            if n in seen_numbers:
                raise PackageError(f"test {n} listed in more than one subtask")
            seen_numbers.add(n)

            in_name = by_basename.get(f"{n}.in")
            out_name = by_basename.get(f"{n}.out") or by_basename.get(f"{n}.ans")
            if in_name is None:
                raise PackageError(f"missing input file {n}.in")
            if out_name is None:
                raise PackageError(f"missing expected-output file {n}.out (or {n}.ans)")

            cases.append(
                ParsedTestcase(
                    number=n,
                    input_bytes=zf.read(in_name),
                    expected_bytes=zf.read(out_name),
                )
            )
        parsed_subtasks.append(
            ParsedSubtask(name=spec.name, weight=spec.weight, ord=idx + offset, testcases=cases)
        )

    return ParsedPackage(config=config, subtasks=parsed_subtasks)
