# Design: Phase 3 — Language Service NLU

Replace the 27-line hard-coded DELAY stub in `apps/language` with a real NLU service: a doctor's
Spanish message goes through a hexagonal `LLMInterpreter` port to an OpenRouter adapter (OpenAI SDK,
default `anthropic/claude-haiku-4.5`), which uses tool/function calling to emit a structured DELAY
intent + minutes + self-reported confidence. Output is validated by Pydantic before leaving the
service; the HTTP envelope `{ intent: { kind, params }, confidence }` is unchanged. This design is
the architectural HOW — exact file tree, type signatures, tool schema, prompt, and error/timeout
mapping — so the tasks phase can break it into mechanical steps with zero ambiguity.

## Quick path (architecture at a glance)

1. **Port/adapter seam** — `LLMInterpreter` Protocol (port) + `OpenRouterInterpreter` (real adapter,
   the ONLY file importing `openai`) + `FakeInterpreter` (tests). FastAPI `Depends` wires the port;
   tests swap the fake via `dependency_overrides`.
2. **Structured output** — OpenAI-style tool calling: one `emit_intent` function with a FLAT schema
   `{ kind, minutes, confidence }`, forced via `tool_choice`. Two Pydantic layers: `ToolOutput`
   (validates raw LLM args) → mapper → `IntentResponse` (nested HTTP envelope).
3. **Honesty contract** — language NEVER returns 200 with a fabricated intent. Validation/contract
   failure → 502 `interpretation_failed`; provider down/timeout/missing key → 503 `llm_unavailable`;
   missing request field → 422 (FastAPI default).
4. **Timeout** — adapter sets the OpenAI client timeout to **8.0s**, strictly below scheduling's 10s
   `AbortController`, so a slow LLM yields a clean language-side 503 instead of a scheduling abort.
   Raised from 4.0s after a live test observed ConnectTimeout→503 at exactly 4.0s on cold-start
   (warm round-trip 2.49s); ordering invariant: scheduling (10s) > language (8s).
5. **Test infra (Standard Mode)** — bootstrap pytest + pytest-asyncio + httpx; fake-based unit/route
   tests for CI; one live test that self-skips when `OPENROUTER_API_KEY` is absent.
6. **ADR-0014** — record the OpenRouter + Haiku-4.5-via-`openai`-SDK decision and the two-hop privacy
   tradeoff that ADR-0010 deferred.

---

## 1. Architecture approach

### Pattern: minimal hexagonal seam (ADR-0002), mirroring scheduling

The scheduling service models its language dependency as a `LanguagePort` interface with an
`HttpLanguageAdapter` implementation (see `apps/scheduling/src/messages/infrastructure/http-language.adapter.ts`).
Phase 3 applies the same hexagonal discipline INSIDE language: the LLM is a driven dependency behind
a port, so the route never knows whether it is talking to OpenRouter or a fake.

```
HTTP boundary (FastAPI route)  ──Depends──▶  LLMInterpreter (Protocol / port)
                                                   ├── OpenRouterInterpreter (real adapter — imports openai)
                                                   └── FakeInterpreter      (tests — no network)
```

- **Driving side (left):** `POST /interpret` route in `app/main.py` — thin; parses request, calls
  the port, maps typed exceptions to HTTP status, returns `IntentResponse`.
- **Port (center):** `app/interpreter/port.py` — a `Protocol` with one async method. No imports of
  `openai`, no I/O.
- **Driven side (right):** `app/interpreter/openrouter.py` (the only `openai`-importing file) and
  `app/interpreter/fake.py`.

### Why a port and not a flat function

The exploration weighed a flat `interpret_with_llm(message)` function against a port/adapter seam.
We choose the seam because: (1) it lets tests inject `FakeInterpreter` via FastAPI
`dependency_overrides` WITHOUT `unittest.mock.patch` monkeypatching `openai` internals — the apply
phase builds and tests fully offline; (2) it isolates the single risky dependency (the LLM) behind
one swappable boundary, consistent with ADR-0002 and the scheduling style; (3) the cost is one extra
~10-line Protocol file, negligible. The service stays stateless (ADR-0010): no session, no DB, the
LLM "stays inside the language context."

### Boundaries (what stays in / out)

- IN language: prompt construction, tool-schema definition, raw-args validation, mapping to the HTTP
  envelope, confidence pass-through, error classification, timeout.
- OUT (unchanged): the HTTP envelope shape, scheduling's planners, CANCEL_BLOCK / clarification /
  threshold enforcement (Phase 5). Note: scheduling timeout raised to 10s in this change (above language's 8s).

---

## 2. Exact file tree

```
apps/language/
├── app/
│   ├── __init__.py                  (existing, empty)
│   ├── main.py                      (REWRITE: thin route + Depends + exception→HTTP mapping)
│   ├── config.py                    (NEW: pydantic-settings Settings)
│   ├── schemas.py                   (NEW: InterpretRequest, ToolOutput, Intent, IntentResponse)
│   ├── errors.py                    (NEW: InterpretationError, LLMUnavailableError typed exceptions)
│   └── interpreter/
│       ├── __init__.py              (NEW, empty)
│       ├── port.py                  (NEW: LLMInterpreter Protocol)
│       ├── prompt.py                (NEW: SYSTEM_PROMPT + few-shot anchors + emit_intent tool schema)
│       ├── openrouter.py            (NEW: OpenRouterInterpreter — the ONLY file importing openai)
│       └── fake.py                  (NEW: FakeInterpreter for tests)
├── tests/
│   ├── __init__.py                  (NEW, empty)
│   ├── conftest.py                  (NEW: TestClient + dependency_overrides → FakeInterpreter)
│   ├── test_schemas.py              (NEW: ToolOutput validation + mapping unit tests)
│   ├── test_interpret_route.py      (NEW: route tests 200/422/502/503 via fakes)
│   └── test_openrouter_live.py      (NEW: live test, self-skips without OPENROUTER_API_KEY)
├── .env.example                     (NEW: OPENROUTER_API_KEY=, LLM_MODEL=anthropic/claude-haiku-4.5)
├── pyproject.toml                   (EDIT: add deps — see §8)
└── (build/ stale artifact REMOVED — see §10)
```

`errors.py` and `prompt.py` are split out (vs. the proposal's implied inline placement) for a single
reason each: `errors.py` is imported by BOTH the adapter (raises) and `main.py` (catches), so it must
not live in either to avoid a circular import; `prompt.py` keeps the long Spanish system text and the
tool JSON schema out of the adapter logic so the prompt can be reviewed/edited as a unit (cognitive-doc
separation). This is a refinement of proposal decision #6, not a contradiction.

### How `Depends` wires the interpreter (app/main.py)

```python
from fastapi import Depends, FastAPI, HTTPException
from functools import lru_cache
from app.config import Settings, get_settings
from app.schemas import InterpretRequest, IntentResponse
from app.interpreter.port import LLMInterpreter
from app.interpreter.openrouter import OpenRouterInterpreter
from app.errors import InterpretationError, LLMUnavailableError

app = FastAPI(title="HealthSync Language Service")


# Provider function: builds the REAL interpreter from settings.
# Cached so the AsyncOpenAI client (and its connection pool) is reused across requests.
@lru_cache
def get_interpreter() -> LLMInterpreter:
    return OpenRouterInterpreter(get_settings())


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "language"}


@app.post("/interpret", response_model=IntentResponse)
async def interpret(
    body: InterpretRequest,                                  # 422 auto on missing/blank message
    interpreter: LLMInterpreter = Depends(get_interpreter),  # injected port
) -> IntentResponse:
    try:
        return await interpreter.interpret(body.message)
    except InterpretationError:
        raise HTTPException(status_code=502, detail={"error": "interpretation_failed"})
    except LLMUnavailableError:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable"})
```

### How tests override it (tests/conftest.py)

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app, get_interpreter
from app.interpreter.fake import FakeInterpreter


@pytest.fixture
def client_with(monkeypatch):
    """Return a factory: pass a FakeInterpreter, get a TestClient wired to it."""
    def _build(fake: FakeInterpreter) -> TestClient:
        app.dependency_overrides[get_interpreter] = lambda: fake
        return TestClient(app)
    yield _build
    app.dependency_overrides.clear()   # teardown: never leak overrides between tests
```

The route depends on `get_interpreter`; tests replace that exact key in `app.dependency_overrides`,
so `openai` is never imported in the unit/route test path. `OpenRouterInterpreter` is only constructed
by the real provider and in `test_openrouter_live.py`.

---

## 3. The tool/function schema and the two-layer Pydantic mapping

### 3.1 `emit_intent` tool schema (FLAT — sent to the LLM)

Defined in `app/interpreter/prompt.py` as a Python dict (OpenAI tools format). FLAT params because
LLMs comply far more reliably with shallow schemas than nested ones; the nesting happens on our side.

```python
EMIT_INTENT_TOOL = {
    "type": "function",
    "function": {
        "name": "emit_intent",
        "description": (
            "Emite la intención estructurada extraída del mensaje del doctor. "
            "Llama SIEMPRE a esta función exactamente una vez."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["DELAY"],
                    "description": "Tipo de intención. En esta fase solo existe DELAY (retraso).",
                },
                "minutes": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Minutos de retraso extraídos del mensaje. Entero >= 1.",
                },
                "confidence": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "description": (
                        "Confianza honesta 0..1. Usa un valor BAJO (p. ej. 0.3) cuando el "
                        "mensaje no indica una duración clara."
                    ),
                },
            },
            "required": ["kind", "minutes", "confidence"],
            "additionalProperties": False,
        },
    },
}
```

The call is forced so the model cannot answer in prose:

```python
tool_choice = {"type": "function", "function": {"name": "emit_intent"}}
```

### 3.2 Layer 1 — `ToolOutput` (validates the raw LLM args), in `app/schemas.py`

```python
from pydantic import BaseModel, Field
from typing import Literal


class ToolOutput(BaseModel):
    """Strict validation of the JSON the model put in tool_calls[0].function.arguments.
    Extra fields are forbidden so an off-schema hallucination is REJECTED, never coerced."""
    model_config = {"extra": "forbid"}

    kind: Literal["DELAY"]                       # unknown kind → ValidationError → 502
    minutes: int = Field(ge=1)                   # minutes < 1 or missing → 502
    confidence: float = Field(ge=0.0, le=1.0)    # out-of-range → 502
```

### 3.3 Layer 2 — `IntentResponse` (the nested HTTP envelope), in `app/schemas.py`

```python
class Intent(BaseModel):
    kind: str
    params: dict                                 # { "minutes": int } for DELAY


class IntentResponse(BaseModel):
    intent: Intent
    confidence: float


class InterpretRequest(BaseModel):
    message: str = Field(min_length=1)           # blank/missing → FastAPI 422
```

`IntentResponse.intent.params` stays a `dict` (ADR-0005: `params` is an open, intent-specific object;
scheduling reads `intent.params.minutes`). Tightening it to a typed model would over-constrain the
extensible contract — kept open deliberately.

### 3.4 The mapping function (flat → nested), in `app/schemas.py`

```python
def tool_output_to_response(out: ToolOutput) -> IntentResponse:
    return IntentResponse(
        intent=Intent(kind=out.kind, params={"minutes": out.minutes}),
        confidence=out.confidence,
    )
```

Flow at the tool boundary vs. HTTP boundary:

```
LLM tool args (flat)                 HTTP response (nested envelope, ADR-0005)
{ "kind": "DELAY",          map      { "intent": { "kind": "DELAY",
  "minutes": 40,            ────▶                  "params": { "minutes": 40 } },
  "confidence": 0.94 }                  "confidence": 0.94 }
```

---

## 4. The system prompt (Spanish)

Lives in `app/interpreter/prompt.py` as `SYSTEM_PROMPT`. The doctor's message is sent as a **user**
turn (never concatenated into the system prompt) to lower prompt-injection risk; the tool boundary is
the second layer of defense.

```python
SYSTEM_PROMPT = """\
Eres el motor de interpretación (NLU) de HealthSync, una agenda médica.
Tu única tarea es leer el mensaje en español de un doctor y extraer una intención de RETRASO (DELAY).

Reglas:
- SIEMPRE llama a la función `emit_intent` exactamente una vez. No respondas en texto.
- `kind` siempre es "DELAY" en esta fase.
- `minutes` es el número entero de minutos de retraso que el doctor comunica.
- Convierte expresiones coloquiales del español a minutos:
    "media hora" = 30
    "un cuarto de hora" / "cuarto de hora" = 15
    "tres cuartos de hora" = 45
    "una hora" = 60
    "llego en 30" / "llego en 30 minutos" = 30
    "me retrasé 20 minutos" = 20
- `confidence` es tu confianza HONESTA entre 0 y 1:
    - Alta (>= 0.9) cuando el mensaje indica una duración clara y explícita.
    - Baja (<= 0.4) cuando NO hay una duración clara (p. ej. "voy tarde", "ya casi llego").
      En ese caso, estima minutes de forma conservadora pero deja la confianza baja para que el
      sistema sepa que debe pedir aclaración más adelante.
- No inventes información clínica. Solo te interesa el retraso logístico.

Ejemplos:
- Mensaje: "Tuve una urgencia, llego 40 minutos tarde"
  -> emit_intent(kind="DELAY", minutes=40, confidence=0.96)
- Mensaje: "Voy tarde"
  -> emit_intent(kind="DELAY", minutes=10, confidence=0.30)
"""
```

Acceptance anchors the prompt must satisfy (verified in tests via the fake, validated manually via the
live test): `"llego 40 minutos tarde"`→40 high; `"media hora de retraso"`→30 high;
`"un cuarto de hora tarde"`→15 high; `"llego en 30"`→30 high; `"voy tarde"`→low confidence.

---

## 5. Error handling — exact mapping

The principle (proposal decision #3): **language NEVER returns HTTP 200 with a fabricated intent.**
Any path where we cannot produce a validated, schema-conformant intent surfaces as a non-2xx error.

### Typed exceptions (app/errors.py)

```python
class InterpretationError(Exception):
    """The LLM responded but its output is unusable: no tool call, args fail Pydantic
    validation, or an unknown kind. The model misbehaved → 502."""


class LLMUnavailableError(Exception):
    """We could not get a usable response from the provider: network/timeout, non-2xx
    from OpenRouter, or a missing/invalid API key → 503."""
```

### Where each is raised (app/interpreter/openrouter.py)

| Failure cause | Detected in adapter | Raised | Caught in main.py → HTTP |
|---|---|---|---|
| `message` field missing/blank in request | — (FastAPI/Pydantic before adapter) | — | **422** (automatic) |
| `resp.choices[0].message.tool_calls` empty/None | adapter | `InterpretationError` | **502** `interpretation_failed` |
| `function.arguments` not valid JSON | adapter (`json.JSONDecodeError`) | `InterpretationError` | **502** `interpretation_failed` |
| args fail `ToolOutput` validation (bad minutes, out-of-range confidence, extra field) | adapter (`pydantic.ValidationError`) | `InterpretationError` | **502** `interpretation_failed` |
| `kind` not in enum `["DELAY"]` | adapter (caught by `Literal` in `ToolOutput`) | `InterpretationError` | **502** `interpretation_failed` |
| `openai.APITimeoutError` / request timeout | adapter | `LLMUnavailableError` | **503** `llm_unavailable` |
| `openai.APIConnectionError`, `openai.APIStatusError` (non-2xx), `openai.AuthenticationError` | adapter | `LLMUnavailableError` | **503** `llm_unavailable` |
| `OPENROUTER_API_KEY` empty/missing at call time | adapter (fail fast before the call) | `LLMUnavailableError` | **503** `llm_unavailable` |

The adapter `try/except` ordering MUST catch `openai` exception types FIRST (→ `LLMUnavailableError`),
then run JSON parse + Pydantic validation in a separate block (→ `InterpretationError`). Never let a
raw `openai` or `pydantic` exception escape the adapter — the route only knows the two typed errors.

### Why 502 vs 503 (and the known collapse)

- **502 `interpretation_failed`** = "the upstream LLM gave us garbage" (bad gateway semantics).
- **503 `llm_unavailable`** = "we could not reach/use the LLM" (service unavailable).

KNOWN PROPERTY (from proposal #3): `HttpLanguageAdapter` maps ANY non-2xx language response to
`503 language_unavailable` today, so at the web client BOTH 502 and 503 collapse to 503. The
distinction is kept for **observability and future refinement**, not for caller behavior in Phase 3.
We deliberately avoid 422 for LLM-output failures so they never collide with request-validation 422.

### Adapter skeleton (app/interpreter/openrouter.py)

```python
import json
from openai import AsyncOpenAI, APIError, APITimeoutError, APIConnectionError
from app.config import Settings
from app.schemas import ToolOutput, IntentResponse, tool_output_to_response
from app.interpreter.prompt import SYSTEM_PROMPT, EMIT_INTENT_TOOL
from app.errors import InterpretationError, LLMUnavailableError

_TOOL_CHOICE = {"type": "function", "function": {"name": "emit_intent"}}


class OpenRouterInterpreter:           # structurally satisfies LLMInterpreter
    def __init__(self, settings: Settings) -> None:
        if not settings.openrouter_api_key:
            self._client = None        # fail fast at call time → 503
        else:
            self._client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.openrouter_api_key,
                timeout=settings.request_timeout,      # 8.0s — see §6
                default_headers={
                    "HTTP-Referer": "https://github.com/victorolave/healthsync",
                    "X-Title": "HealthSync",
                },
            )
        self._model = settings.llm_model

    async def interpret(self, message: str) -> IntentResponse:
        if self._client is None:
            raise LLMUnavailableError("OPENROUTER_API_KEY is not configured")
        try:
            resp = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": message},
                ],
                tools=[EMIT_INTENT_TOOL],
                tool_choice=_TOOL_CHOICE,
            )
        except (APITimeoutError, APIConnectionError, APIError) as exc:
            raise LLMUnavailableError(str(exc)) from exc

        tool_calls = resp.choices[0].message.tool_calls
        if not tool_calls:
            raise InterpretationError("model returned no tool call")
        try:
            raw = json.loads(tool_calls[0].function.arguments)
            validated = ToolOutput.model_validate(raw)
        except Exception as exc:        # JSONDecodeError or pydantic.ValidationError
            raise InterpretationError(str(exc)) from exc

        return tool_output_to_response(validated)
```

`APIError` is the `openai` base class, so catching it last covers `AuthenticationError`,
`APIStatusError`, `RateLimitError`, etc. — all map to 503.

---

## 6. Timeout

- **Value: `request_timeout = 8.0` seconds**, defined in `Settings` (config.py) and passed to
  `AsyncOpenAI(timeout=...)` in the adapter constructor.
- **Where it matters:** the call chain is `scheduling → language → OpenRouter → Anthropic`.
  `HttpLanguageAdapter` has a hard **10000ms** `AbortController` (verified in
  `http-language.adapter.ts` line 20). Setting the language-side timeout to **8.0s** (strictly below
  10s) guarantees that a slow LLM produces a clean language-side **503 `llm_unavailable`** rather than
  scheduling aborting the connection mid-flight (which scheduling reports as
  `503 language_unavailable` with no body from language). 8.0s leaves ~2s of headroom for network +
  scheduling-side overhead inside the 10s budget.
- **Raised from 4.0s:** a live OpenRouter test observed ConnectTimeout→503 at exactly 4.0s on
  cold-start (warm round-trip was 2.49s). Ordering invariant preserved: scheduling (10s) > language (8s).

---

## 7. Type signatures

### Port (app/interpreter/port.py)

```python
from typing import Protocol
from app.schemas import IntentResponse


class LLMInterpreter(Protocol):
    async def interpret(self, message: str) -> IntentResponse: ...
```

Structural typing (`Protocol`) — adapters do NOT inherit; they conform by shape. Mirrors the
"swappable driven port" intent of ADR-0002 without nominal coupling.

### Adapter (app/interpreter/openrouter.py)

```python
class OpenRouterInterpreter:
    def __init__(self, settings: Settings) -> None: ...
    async def interpret(self, message: str) -> IntentResponse: ...
```

### Fake (app/interpreter/fake.py)

```python
class FakeInterpreter:
    def __init__(
        self,
        response: IntentResponse | None = None,
        raises: Exception | None = None,
    ) -> None: ...

    async def interpret(self, message: str) -> IntentResponse:
        if self._raises is not None:
            raise self._raises
        return self._response
```

The fake supports BOTH a canned success (`response=`) and a forced failure (`raises=`) so route tests
can drive 200, 502, and 503 paths deterministically with no network.

### Settings (app/config.py)

```python
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openrouter_api_key: str = ""                        # empty → 503 at call time (fail fast)
    llm_model: str = "anthropic/claude-haiku-4.5"       # override via LLM_MODEL
    request_timeout: float = 8.0                         # seconds; < scheduling 10s AbortController


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

---

## 8. Test strategy (Standard Mode — language is NOT strict TDD)

Strict TDD is scheduling-only (per the stack decision). Language uses **Standard Mode**: test-first
encouraged, not enforced. All CI-runnable tests are fake-based and offline.

### pyproject.toml additions

```toml
dependencies = [
    "fastapi>=0.111.0",
    "uvicorn[standard]>=0.29.0",
    "openai>=1.0",
    "pydantic-settings>=2.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "httpx>=0.27",          # FastAPI TestClient ASGI transport
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

`openai` and `pydantic-settings` are runtime deps; pytest/pytest-asyncio/httpx are dev-only.
`install-language` in the Makefile must install the `dev` extra (`pip install -e ".[dev]"`).

### Test files and what each covers

| File | Covers | Mechanism |
|---|---|---|
| `tests/test_schemas.py` | `ToolOutput` validation (good args pass; bad minutes / out-of-range confidence / extra field / unknown kind raise `ValidationError`); `tool_output_to_response` maps flat→nested correctly | pure unit, no client |
| `tests/test_interpret_route.py` | **200** happy path for each acceptance case (fake returns canned `IntentResponse`); **422** missing/blank `message`; **502** fake raises `InterpretationError`; **503** fake raises `LLMUnavailableError`; envelope shape `{ intent: { kind, params }, confidence }` exact | `TestClient` + `dependency_overrides` → `FakeInterpreter` |
| `tests/test_openrouter_live.py` | real OpenRouter call returns a validated DELAY for `"llego 40 minutos tarde"` (minutes==40, high confidence) | live; self-skips |

### Acceptance cases as route tests (fake-driven)

For each, build a `FakeInterpreter` returning the expected `IntentResponse`, POST the Spanish message,
assert the envelope. The fake decouples these from real LLM nondeterminism (CI-safe); the live test
validates the real path manually:

| Spanish message | minutes | confidence |
|---|---|---|
| `"Tuve una urgencia, llego 40 minutos tarde"` | 40 | high (~0.96) |
| `"media hora de retraso"` | 30 | high |
| `"un cuarto de hora tarde"` | 15 | high |
| `"llego en 30"` | 30 | high |
| `"voy tarde"` | small | LOW (<=0.4) |

### Live test guard (mirrors scheduling `describeIfDb`)

```python
import os
import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set; skipping live OpenRouter integration test",
)
```

### Exact commands

```bash
# unit + route (offline, CI-safe)
cd apps/language && .venv/bin/pytest          # or: pytest  (with venv active)

# include the live test (requires a real key)
cd apps/language && OPENROUTER_API_KEY=sk-... .venv/bin/pytest
```

---

## 9. Makefile changes

Add a `test-language` target and split `test` into per-app targets aggregated by `test`:

```makefile
.PHONY: ... test test-language test-scheduling

test: test-scheduling test-language   ## Run all app tests (scheduling + language)

test-scheduling:                       ## Run scheduling (Jest) tests
	cd $(SCHEDULING_DIR) && $(PNPM) test

test-language:                         ## Run language (pytest) tests
	cd $(LANGUAGE_DIR) && .venv/bin/pytest
```

`install-language` must also pull the dev extra so `pytest` exists in the venv:

```makefile
install-language:
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -e "$(LANGUAGE_DIR)[dev]"
```

---

## 10. build/ cleanup and .gitignore (CORRECTION to proposal #9)

**Finding (verified this phase):** the root `.gitignore` ALREADY ignores `build/`, `.env`, `.env.*`
(with `!.env.example`), `.venv/`, `__pycache__/`, and `*.egg-info/` (root `.gitignore` lines 6–27).
So the gitignore-additions part of proposal decision #9 is ALREADY DONE — tasks must NOT duplicate it.

What remains is the stale artifact on disk at `apps/language/build/lib/app/` (an old `main.py` with
only `/health`, no `/interpret`). Because `build/` is gitignored, it may be tracked-from-before-the-rule
OR merely untracked-on-disk. Tasks MUST:

1. Check tracking: `git ls-files apps/language/build/`.
2. If tracked → `git rm -r --cached apps/language/build/` and delete the directory.
3. If untracked → just delete the directory from disk.

`.env` handling is already covered by the existing root ignore; only `apps/language/.env.example`
(a NEW committed file documenting `OPENROUTER_API_KEY` and `LLM_MODEL`) needs to be added.

---

## 11. ADR-0014 — LLM provider and model

Create `docs/adr/0014-llm-provider.md` (number 0014 confirmed — current ADRs are 0001–0013), using
the repo template (`docs/adr/template.md`):

- **Title:** `0014. LLM provider and model`
- **Status:** Accepted — **Date:** 2026-06-06 — **Deciders:** project owner
- **Context:** ADR-0010 chose "LLM with structured output" but explicitly DEFERRED the specific
  provider/model and its data-handling terms to a separate ADR. Phase 3 needs a concrete provider to
  replace the DELAY stub. This ADR fills that gap.
- **Decision drivers:** model/provider flexibility behind one key; low latency to fit scheduling's 10s
  timeout (language-side 8s, strictly below); low cost for a teaching project; OpenAI-compatible API
  to use a mature SDK; reliable structured output (tool calling).
- **Considered options:** (A) OpenRouter gateway + `openai` SDK, default `anthropic/claude-haiku-4.5`;
  (B) Anthropic direct via `anthropic` SDK; (C) OpenAI direct via `openai` SDK.
- **Decision outcome:** Chosen **Option A** — OpenRouter (OpenAI-compatible, `base_url`
  `https://openrouter.ai/api/v1`) with the `openai` Python SDK and tool/function calling; default
  model `anthropic/claude-haiku-4.5`, overridable via `LLM_MODEL`. One key (`OPENROUTER_API_KEY`)
  swaps models/providers with no code change.
- **Consequences:**
  - Good: model flexibility without code change; Haiku 4.5 is fast + cheap and sufficient for Spanish
    DELAY+minutes extraction; mature SDK; structured output enforced by tool calling + Pydantic.
  - Bad (accepted tradeoff): **TWO network hops** for the doctor's message (client → OpenRouter →
    underlying provider). This is an additional data-exposure surface vs. a direct provider. Accepted
    for the MVP/teaching scope and recorded explicitly here (ADR-0010 flagged the privacy concern).
- **Pros/cons of options:** A — flexible + one key, but two hops + extra intermediary trust.
  B — one hop, Anthropic-native tool use, but provider lock-in + separate keys per provider later.
  C — broad model access, but OpenAI lock-in and no Anthropic models without a gateway.
- **References:** ADR-0010 (NLU mechanism — defers this), ADR-0005 (intent `{kind, params}` contract
  the output is validated against), ADR-0007 (synchronous inter-service REST and its timeout
  consequence).

---

## Architectural decisions (ADR-style, this phase)

| # | Decision | Rationale | Rejected alternative |
|---|---|---|---|
| D1 | Port/adapter seam (`LLMInterpreter` Protocol) | Test injection via `dependency_overrides` (offline CI); isolates the one risky dependency; ADR-0002 consistency | Flat `interpret_with_llm` function — would force `mock.patch` of `openai` internals in tests |
| D2 | `openai` SDK against OpenRouter, NOT the `anthropic` SDK | OpenRouter is OpenAI-compatible; one SDK + one key swaps models | `anthropic` SDK — locks to one provider, contradicts the gateway choice |
| D3 | Tool/function calling with forced `tool_choice` + FLAT schema | Deterministic schema compliance; flat schema maximizes LLM reliability | `response_format: json_object` (model can still deviate) or prompted JSON (most fragile) |
| D4 | Two Pydantic layers (`ToolOutput` → `IntentResponse`) with `extra: forbid` | Validate raw LLM args strictly, map to the stable nested envelope; reject off-schema, never coerce | Single model bound to the LLM shape — would couple the HTTP contract to the tool schema |
| D5 | 502 for bad LLM output, 503 for unavailability, 422 only for request validation | Honest, observable failure surface; never 200 with a fabricated intent | Returning 422 for LLM-output failures (collides with request-validation 422) or a fallback fake intent (dishonest) |
| D6 | Language-side timeout 8.0s (< scheduling 10s) | Slow LLM yields a clean 503, not a scheduling-side abort with no body | No language timeout — relies on scheduling's `AbortController`, loses the structured error body |
| D7 | Self-reported `confidence` float, returned unchanged | Aligns with ADR-0010 "the LLM provides a confidence signal"; simple; Phase 3 reports only | Logprobs heuristic (Phase 5 candidate); fixed 1.0 (breaks Phase 5 clarification path) |
| D8 | Standard Mode tests, live test self-skips on missing key | CI runs fully offline + deterministic via the fake; real path validated on demand | Live calls in CI — nondeterministic, costs money, needs a key in CI |
| D9 | `errors.py` + `prompt.py` as separate modules | `errors` shared by adapter+route (avoid circular import); `prompt` reviewable as a unit | Inlining both in the adapter — couples prompt text to logic, risks import cycle |

---

## Checklist (tasks phase can verify against this)

- [ ] File tree under `apps/language/app/` and `tests/` matches §2 exactly.
- [ ] `LLMInterpreter` Protocol has `async def interpret(self, message: str) -> IntentResponse`.
- [ ] Only `app/interpreter/openrouter.py` imports `openai`.
- [ ] `emit_intent` tool schema is FLAT `{ kind, minutes, confidence }`, `required` all three, forced via `tool_choice`.
- [ ] `ToolOutput` uses `extra: forbid`; mapping produces the nested `{ intent: { kind, params: { minutes } }, confidence }`.
- [ ] System prompt is Spanish, converts idioms, instructs honest low confidence, includes ≥1 few-shot anchor.
- [ ] Error mapping: 422 (request) / 502 `interpretation_failed` (bad LLM output) / 503 `llm_unavailable` (provider/timeout/missing key); never 200 with a fake intent.
- [ ] `request_timeout = 8.0` in Settings, passed to `AsyncOpenAI(timeout=...)`.
- [ ] pyproject adds `openai`, `pydantic-settings` (runtime) and `pytest`, `pytest-asyncio`, `httpx` (dev); `asyncio_mode = auto`.
- [ ] Makefile has `test-language`; `test` aggregates scheduling + language; `install-language` installs `[dev]`.
- [ ] Stale `apps/language/build/` removed (git-untracked if it was tracked); `.gitignore` left as-is (already covers it); `.env.example` added.
- [ ] `docs/adr/0014-llm-provider.md` created per §11.

## Next step

`sdd-tasks` (once the spec is also ready) — break this design into mechanical, dependency-ordered
steps. Tasks must read BOTH this design and the spec.
