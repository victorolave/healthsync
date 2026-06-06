"""Acceptance tests for POST /interpret via FakeInterpreter (fully offline)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.errors import InterpretationError, LLMUnavailableError
from app.interpreter.fake import FakeInterpreter
from app.main import app, get_interpreter
from app.schemas import Intent, IntentResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _override(fake: FakeInterpreter) -> TestClient:
    app.dependency_overrides[get_interpreter] = lambda: fake
    return TestClient(app)


def _clear() -> None:
    app.dependency_overrides.clear()


def _delay(minutes: int, confidence: float) -> IntentResponse:
    return IntentResponse(
        intent=Intent(kind="DELAY", params={"minutes": minutes}),
        confidence=confidence,
    )


# ---------------------------------------------------------------------------
# 200 Acceptance cases (FakeInterpreter-driven)
# ---------------------------------------------------------------------------

class TestInterpretAcceptanceCases:
    def teardown_method(self) -> None:
        _clear()

    def test_40_minutos_tarde(self) -> None:
        client = _override(FakeInterpreter(response=_delay(40, 0.96)))
        r = client.post("/interpret", json={"message": "llego 40 minutos tarde"})
        assert r.status_code == 200
        data = r.json()
        assert data["intent"]["kind"] == "DELAY"
        assert data["intent"]["params"]["minutes"] == 40
        assert data["confidence"] == pytest.approx(0.96)

    def test_media_hora(self) -> None:
        client = _override(FakeInterpreter(response=_delay(30, 0.85)))
        r = client.post("/interpret", json={"message": "media hora"})
        assert r.status_code == 200
        assert r.json()["intent"]["params"]["minutes"] == 30

    def test_un_cuarto(self) -> None:
        client = _override(FakeInterpreter(response=_delay(15, 0.80)))
        r = client.post("/interpret", json={"message": "un cuarto de hora"})
        assert r.status_code == 200
        assert r.json()["intent"]["params"]["minutes"] == 15

    def test_llego_en_30(self) -> None:
        client = _override(FakeInterpreter(response=_delay(30, 0.92)))
        r = client.post("/interpret", json={"message": "llego en 30"})
        assert r.status_code == 200
        assert r.json()["intent"]["params"]["minutes"] == 30

    def test_voy_tarde_low_confidence(self) -> None:
        client = _override(FakeInterpreter(response=_delay(10, 0.30)))
        r = client.post("/interpret", json={"message": "voy tarde"})
        assert r.status_code == 200
        data = r.json()
        assert data["intent"]["kind"] == "DELAY"
        assert data["confidence"] < 0.7


# ---------------------------------------------------------------------------
# Error paths
# ---------------------------------------------------------------------------

class TestInterpretErrorPaths:
    def teardown_method(self) -> None:
        _clear()

    def test_422_blank_message(self) -> None:
        """FastAPI/Pydantic rejects blank message (min_length=1) before hitting interpreter."""
        client = _override(FakeInterpreter(response=_delay(10, 0.9)))
        r = client.post("/interpret", json={"message": ""})
        assert r.status_code == 422

    def test_422_missing_message_field(self) -> None:
        client = _override(FakeInterpreter(response=_delay(10, 0.9)))
        r = client.post("/interpret", json={})
        assert r.status_code == 422

    def test_502_interpretation_failed(self) -> None:
        client = _override(FakeInterpreter(raises=InterpretationError("bad output")))
        r = client.post("/interpret", json={"message": "llego tarde"})
        assert r.status_code == 502
        assert r.json()["error"] == "interpretation_failed"

    def test_503_llm_unavailable(self) -> None:
        client = _override(FakeInterpreter(raises=LLMUnavailableError("timeout")))
        r = client.post("/interpret", json={"message": "llego tarde"})
        assert r.status_code == 503
        assert r.json()["error"] == "llm_unavailable"


# ---------------------------------------------------------------------------
# Envelope shape contract
# ---------------------------------------------------------------------------

class TestEnvelopeShape:
    def teardown_method(self) -> None:
        _clear()

    def test_200_envelope_has_intent_and_confidence(self) -> None:
        client = _override(FakeInterpreter(response=_delay(20, 0.88)))
        r = client.post("/interpret", json={"message": "veinte minutos"})
        assert r.status_code == 200
        data = r.json()
        assert "intent" in data
        assert "confidence" in data
        assert "kind" in data["intent"]
        assert "params" in data["intent"]

    def test_health_endpoint_unchanged(self) -> None:
        client = _override(FakeInterpreter(response=_delay(10, 0.9)))
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "service": "language"}
