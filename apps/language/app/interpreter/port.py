"""Hexagonal port: the LLMInterpreter Protocol.

Any interpreter implementation (real or fake) must satisfy this structural
Protocol. No openai import here — the port is pure Python.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.schemas import IntentResponse


@runtime_checkable
class LLMInterpreter(Protocol):
    """Port: interprets a raw message and returns a structured IntentResponse."""

    async def interpret(self, message: str) -> IntentResponse:
        ...
