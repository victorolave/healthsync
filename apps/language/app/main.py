"""FastAPI application for the HealthSync Language service.

Thin route handler — all LLM logic lives in the interpreter adapter.
The get_interpreter() provider is overridden in tests via dependency_overrides.
"""
from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.errors import InterpretationError, LLMUnavailableError
from app.interpreter.openrouter import OpenRouterInterpreter
from app.interpreter.port import LLMInterpreter
from app.schemas import IntentResponse, InterpretRequest

app = FastAPI(title="HealthSync Language Service")


@lru_cache
def get_interpreter() -> LLMInterpreter:
    """Provide the real OpenRouterInterpreter, lazily cached.

    Tests override this via ``app.dependency_overrides[get_interpreter]``.
    The AsyncOpenAI client is never constructed at import time.
    """
    return OpenRouterInterpreter(get_settings())


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "language"}


@app.post("/interpret", response_model=IntentResponse)
async def interpret(
    body: InterpretRequest,
    interpreter: LLMInterpreter = Depends(get_interpreter),
) -> IntentResponse | JSONResponse:
    try:
        return await interpreter.interpret(body.message)
    except InterpretationError:
        return JSONResponse(status_code=502, content={"error": "interpretation_failed"})
    except LLMUnavailableError:
        return JSONResponse(status_code=503, content={"error": "llm_unavailable"})
