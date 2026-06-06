"""Shared fixtures for the Language service test suite."""
from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.interpreter.fake import FakeInterpreter
from app.main import app, get_interpreter
from app.schemas import Intent, IntentResponse


def _make_delay_response(minutes: int, confidence: float) -> IntentResponse:
    return IntentResponse(
        intent=Intent(kind="DELAY", params={"minutes": minutes}),
        confidence=confidence,
    )


@pytest.fixture
def delay_40() -> IntentResponse:
    return _make_delay_response(minutes=40, confidence=0.96)


@pytest.fixture
def client_with(delay_40: IntentResponse) -> Generator[TestClient, None, None]:
    """TestClient whose get_interpreter() dep is overridden with FakeInterpreter."""
    fake = FakeInterpreter(response=delay_40)
    app.dependency_overrides[get_interpreter] = lambda: fake
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
