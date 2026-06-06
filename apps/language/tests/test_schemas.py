"""Unit tests for ToolOutput validation and the tool_output_to_response mapper."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import IntentResponse, ToolOutput, tool_output_to_response


class TestToolOutputValidation:
    def test_valid_delay_roundtrip(self) -> None:
        out = ToolOutput(kind="DELAY", minutes=40, confidence=0.96)
        assert out.kind == "DELAY"
        assert out.minutes == 40
        assert out.confidence == pytest.approx(0.96)

    def test_minutes_must_be_at_least_1(self) -> None:
        with pytest.raises(ValidationError):
            ToolOutput(kind="DELAY", minutes=0, confidence=0.9)

    def test_confidence_must_be_within_bounds_upper(self) -> None:
        with pytest.raises(ValidationError):
            ToolOutput(kind="DELAY", minutes=10, confidence=1.1)

    def test_confidence_must_be_within_bounds_lower(self) -> None:
        with pytest.raises(ValidationError):
            ToolOutput(kind="DELAY", minutes=10, confidence=-0.1)

    def test_extra_field_forbidden(self) -> None:
        with pytest.raises(ValidationError):
            ToolOutput(kind="DELAY", minutes=10, confidence=0.9, unknown_field="x")  # type: ignore[call-arg]

    def test_unknown_kind_rejected(self) -> None:
        with pytest.raises(ValidationError):
            ToolOutput(kind="CANCEL_BLOCK", minutes=10, confidence=0.9)  # type: ignore[arg-type]


class TestToolOutputToResponse:
    def test_mapper_produces_correct_envelope(self) -> None:
        out = ToolOutput(kind="DELAY", minutes=30, confidence=0.85)
        resp = tool_output_to_response(out)

        assert isinstance(resp, IntentResponse)
        assert resp.intent.kind == "DELAY"
        assert resp.intent.params == {"minutes": 30}
        assert resp.confidence == pytest.approx(0.85)

    def test_mapper_preserves_minutes_in_params(self) -> None:
        out = ToolOutput(kind="DELAY", minutes=15, confidence=0.75)
        resp = tool_output_to_response(out)
        assert resp.intent.params["minutes"] == 15
