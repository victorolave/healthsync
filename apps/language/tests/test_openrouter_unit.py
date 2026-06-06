"""Offline unit tests for OpenRouterInterpreter construction.

These tests instantiate the adapter with a dummy key (no network call is made
— constructing AsyncOpenAI does not open a connection) and assert the client
is configured to honor ADR-0007's "strictly below 5s" latency budget.
"""
from __future__ import annotations

from app.config import Settings
from app.interpreter.openrouter import OpenRouterInterpreter


class TestOpenRouterClientConfig:
    """Guard regressions on timeout / retry settings (ADR-0007)."""

    def _make_interpreter(self) -> OpenRouterInterpreter:
        settings = Settings(
            openrouter_api_key="dummy-key-for-unit-test",
            llm_model="test/model",
        )
        return OpenRouterInterpreter(settings)

    def test_max_retries_is_zero(self) -> None:
        """max_retries=0 ensures the 4s timeout is the hard total bound, not per-attempt."""
        interpreter = self._make_interpreter()
        assert interpreter._client is not None
        assert interpreter._client.max_retries == 0

    def test_timeout_is_four_seconds(self) -> None:
        """Timeout must be exactly 4.0s to stay strictly below ADR-0007's 5s budget."""
        interpreter = self._make_interpreter()
        assert interpreter._client is not None
        # The openai SDK stores timeout as a httpx.Timeout object; the connect/read/write
        # values may differ, but the top-level default is what Settings.request_timeout sets.
        # Introspecting via _client.timeout works for both float and Timeout objects.
        timeout = interpreter._client.timeout
        # Normalize: float or httpx.Timeout(connect, read, write, pool) — the SDK default is
        # to store a Timeout instance when a float is passed.
        if hasattr(timeout, "read"):
            assert timeout.read == 4.0
        else:
            assert float(timeout) == 4.0
