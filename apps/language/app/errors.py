"""Domain errors for the Language service.

Kept in a separate module to avoid circular imports: both the
OpenRouterInterpreter adapter and the FastAPI route handler import from here.
"""


class InterpretationError(Exception):
    """Raised when the LLM returns output that cannot be mapped to a valid intent.

    Examples: empty tool_calls, malformed JSON, ToolOutput validation failure,
    or an unrecognised intent kind.

    HTTP mapping: 502 Interpretation Failed.
    """


class LLMUnavailableError(Exception):
    """Raised when the LLM cannot be reached or the API key is missing/invalid.

    Examples: APITimeoutError, APIConnectionError, APIError (auth / rate-limit),
    missing OPENROUTER_API_KEY at call time.

    HTTP mapping: 503 LLM Unavailable.
    """
