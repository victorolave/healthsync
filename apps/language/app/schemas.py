"""Pydantic models for the Language service HTTP contract and LLM output parsing.

Two-layer design (per ADR-0005):
  Layer 1 — ToolOutput: validates the flat tool_calls.function.arguments blob from the LLM.
  Layer 2 — IntentResponse: the stable HTTP envelope { intent: { kind, params }, confidence }.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class InterpretRequest(BaseModel):
    """POST /interpret request body."""

    message: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Layer 1: LLM tool output (flat, validated strictly)
# ---------------------------------------------------------------------------

class ToolOutput(BaseModel):
    """Validated representation of the emit_intent tool call arguments.

    extra=forbid ensures the LLM cannot sneak in unknown fields, and that
    we never silently pass a malformed response downstream.
    """

    model_config = {"extra": "forbid"}

    kind: Literal["DELAY"]
    minutes: int = Field(..., ge=1)
    confidence: float = Field(..., ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Layer 2: HTTP envelope (stable contract, ADR-0005)
# ---------------------------------------------------------------------------

class Intent(BaseModel):
    kind: str
    params: dict


class IntentResponse(BaseModel):
    intent: Intent
    confidence: float = Field(..., ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Mapper: Layer 1 → Layer 2
# ---------------------------------------------------------------------------

def tool_output_to_response(output: ToolOutput) -> IntentResponse:
    """Convert a validated ToolOutput into the stable HTTP IntentResponse envelope."""
    return IntentResponse(
        intent=Intent(kind=output.kind, params={"minutes": output.minutes}),
        confidence=output.confidence,
    )
