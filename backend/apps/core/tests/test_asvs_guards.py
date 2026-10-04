"""Guards that keep two ASVS promises true as the code grows, and a check that docs/security/asvs-l1.md only
points at evidence that exists."""

import re
from pathlib import Path

import pytest
from rest_framework.test import APIClient

BACKEND = Path(__file__).resolve().parents[3]
REPO = BACKEND.parent
APPS = BACKEND / "apps"


def source_files():
    for path in APPS.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        yield path


# ---- 5.3.4 / 5.3.5: SQL only through the ORM ---------------------------------------------------------

RAW_SQL = re.compile(r"\.raw\(|\.extra\(|RawSQL\(|cursor\.execute\(|connection\.execute")
ALLOWED_RAW_SQL = {"apps/core/health.py"}  # the constant `SELECT 1` readiness probe


def test_no_raw_sql_anywhere_but_the_readiness_probe():
    found = {str(p.relative_to(BACKEND)) for p in source_files() if RAW_SQL.search(p.read_text())}
    assert found <= ALLOWED_RAW_SQL, f"raw SQL outside the allowed list: {sorted(found - ALLOWED_RAW_SQL)}"


def test_the_readiness_probe_runs_a_constant_statement():
    text = (APPS / "core" / "health.py").read_text()
    assert text.count("cursor.execute(") == 1 and 'cursor.execute("SELECT 1")' in text


# ---- 5.3.8: no shell, no string-built commands -------------------------------------------------------


def test_commands_are_never_run_through_a_shell():
    offenders = [
        str(p.relative_to(BACKEND))
        for p in source_files()
        if re.search(r"shell\s*=\s*True|os\.system\(|os\.popen\(", p.read_text())
    ]
    assert offenders == []


# ---- 14.5.3: no cross-origin access is ever granted ------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/api/health/live", "/api/public/booking/options", "/api/auth/me"])
def test_no_cross_origin_access_is_ever_granted(path):
    r = APIClient().get(path, HTTP_ORIGIN="https://evil.example")
    assert "Access-Control-Allow-Origin" not in r
    assert "Access-Control-Allow-Credentials" not in r


@pytest.mark.django_db
def test_a_cross_origin_preflight_gets_no_permission():
    r = APIClient().options(
        "/api/auth/login",
        HTTP_ORIGIN="https://evil.example",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
    )
    assert "Access-Control-Allow-Origin" not in r


# ---- the checklist only cites evidence that exists -----------------------------------------------------

CHECKLIST = REPO / "docs" / "security" / "asvs-l1.md"
EVIDENCE = re.compile(r"`([A-Za-z0-9_./\[\]()-]+(?:::[A-Za-z0-9_]+)?)`")


def evidence_tokens():
    return sorted(set(EVIDENCE.findall(CHECKLIST.read_text())))


def test_the_checklist_exists_and_cites_evidence():
    assert CHECKLIST.exists()
    assert len([t for t in evidence_tokens() if "/" in t]) > 40


@pytest.mark.parametrize("token", [t for t in evidence_tokens() if "/" in t])
def test_every_file_and_test_the_checklist_cites_exists(token):
    path, _, test_name = token.partition("::")
    file = REPO / path
    assert file.exists(), f"{path} is cited but does not exist"
    if test_name:
        assert re.search(rf"def {re.escape(test_name)}\(", file.read_text()), f"{test_name} is not in {path}"
