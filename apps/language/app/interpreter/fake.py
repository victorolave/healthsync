"""FakeInterpreter: deterministic test double for LLMInterpreter.

Drives 200/502/503 paths without any network call or openai import.
"""
from __future__ import annotations

from app.schemas import IntentResponse


class FakeInterpreter:
    """Test double for LLMInterpreter.

    Pass ``response`` to return a fixed IntentResponse, or ``raises`` to
    raise a specific exception when interpret() is called.
    """

    def __init__(
        self,
        response: IntentResponse | None = None,
        raises: Exception | None = None,
    ) -> None:
        if response is None and raises is None:
            raise ValueError("FakeInterpreter requires either response or raises")
        self._response = response
        self._raises = raises

    async def interpret(self, message: str) -> IntentResponse:  # noqa: ARG002
        if self._raises is not None:
            raise self._raises
        assert self._response is not None
        return self._response
