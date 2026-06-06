"""Live integration test against the real OpenRouter API.

This test is SKIPPED automatically when OPENROUTER_API_KEY is not set in the
environment, so the offline suite always stays GREEN. Run with a real key:

    OPENROUTER_API_KEY=sk-... cd apps/language && .venv/bin/pytest tests/test_openrouter_live.py -v
"""
from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set — live test skipped",
)


@pytest.mark.asyncio
async def test_live_round_trip_delay() -> None:
    """Real call to OpenRouter: 'llego 40 minutos tarde' → DELAY/40/high confidence."""
    from app.config import get_settings
    from app.interpreter.openrouter import OpenRouterInterpreter

    interpreter = OpenRouterInterpreter(get_settings())
    response = await interpreter.interpret("llego 40 minutos tarde")

    assert response.intent.kind == "DELAY"
    assert response.intent.params["minutes"] == 40
    assert 0.0 <= response.confidence <= 1.0
