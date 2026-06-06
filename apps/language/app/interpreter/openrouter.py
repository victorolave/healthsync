"""OpenRouterInterpreter — the ONLY module in this codebase that imports openai.

Adapter (hexagonal) that calls OpenRouter via the openai SDK, forces the
emit_intent tool call, validates the response with Pydantic, and maps all
error paths to domain exceptions so the route never deals with openai types.
"""
from __future__ import annotations

import json

import openai
from openai import AsyncOpenAI
from pydantic import ValidationError

from app.config import Settings
from app.errors import InterpretationError, LLMUnavailableError
from app.interpreter.prompt import EMIT_INTENT_TOOL, SYSTEM_PROMPT, _TOOL_CHOICE
from app.schemas import IntentResponse, ToolOutput, tool_output_to_response


class OpenRouterInterpreter:
    """Real LLM adapter against OpenRouter's OpenAI-compatible API."""

    def __init__(self, settings: Settings) -> None:
        if not settings.openrouter_api_key:
            # Fail-fast: raise at call time (not at import/init) so that the
            # service can still start and serve /health without a key.
            self._client: AsyncOpenAI | None = None
        else:
            # max_retries=0: the SDK default is 2, and the 8s timeout is
            # per-attempt — 3 attempts + backoff would exceed 24s, violating
            # ADR-0007's ordering invariant (language 8s < scheduling 10s).
            # A single attempt makes the 8s timeout a hard total bound.
            self._client = AsyncOpenAI(
                api_key=settings.openrouter_api_key,
                base_url="https://openrouter.ai/api/v1",
                timeout=settings.request_timeout,
                max_retries=0,
            )
        self._model = settings.llm_model

    async def interpret(self, message: str) -> IntentResponse:
        """Call the LLM and return a validated IntentResponse.

        Raises:
            LLMUnavailableError: key missing, timeout, connection error, or
                any openai API-level error (auth, rate-limit, server error).
            InterpretationError: LLM returned a response that cannot be
                mapped to a valid ToolOutput (empty tool_calls, bad JSON,
                validation failure, unknown kind).
        """
        if self._client is None:
            raise LLMUnavailableError("OPENROUTER_API_KEY is not configured")

        # --- call LLM (openai exceptions → LLMUnavailableError) -------------
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": message},
                ],
                tools=[EMIT_INTENT_TOOL],
                tool_choice=_TOOL_CHOICE,
            )
        except (
            openai.APITimeoutError,
            openai.APIConnectionError,
            openai.APIError,  # base class — covers auth, rate-limit, server errors
        ) as exc:
            raise LLMUnavailableError(str(exc)) from exc

        # --- parse tool_calls (structural failures → InterpretationError) ----
        try:
            tool_calls = response.choices[0].message.tool_calls
            if not tool_calls:
                raise InterpretationError("LLM returned no tool_calls")

            raw_args = tool_calls[0].function.arguments
            parsed = json.loads(raw_args)
            output = ToolOutput.model_validate(parsed)
        except InterpretationError:
            raise
        except (json.JSONDecodeError, ValidationError, IndexError, AttributeError, TypeError) as exc:
            raise InterpretationError(f"Failed to parse emit_intent output: {exc}") from exc

        return tool_output_to_response(output)
