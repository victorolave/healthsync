# language-nlu Specification

## Purpose

Define what must be true after Phase 3 is applied: `apps/language` transitions
from a 27-line hard-coded stub into a real NLU service. A Spanish free-text message
from a doctor enters `POST /interpret`, is forwarded to an LLM via OpenRouter, and
exits as a validated `{ intent: { kind, params }, confidence }` envelope — or a
structured error. No other app changes.

**Acceptance anchor:** "Llego 40 minutos tarde" → `DELAY / minutes: 40`.

---

## Glossary

| Term | Meaning in this spec |
|---|---|
| LLMInterpreter | The hexagonal port (Protocol) that the route depends on |
| OpenRouterInterpreter | The production adapter: calls OpenRouter via openai SDK |
| FakeInterpreter | The test double: returns a configurable result without any network call |
| tool call / function call | OpenAI-style structured output mechanism used to extract intent |
| off-schema | LLM output that does not conform to the `emit_intent` tool schema |
| `emit_intent` | Name of the tool schema the LLM is instructed to call |

---

## Requirements

---

### Requirement: POST /interpret endpoint

`language` MUST expose `POST /interpret` accepting `{ "message": string }`.

The response MUST conform to the ADR-0005 envelope on success:

```json
{
  "intent": { "kind": "DELAY", "params": { "minutes": <positive int> } },
  "confidence": <float 0..1>
}
```

The HTTP contract (path, request shape, response envelope) is stable across all
phases (ADR-0005). Phase 3 changes only the body of the implementation — not the
observable HTTP interface seen by `scheduling`.

#### Scenario: missing message field returns 422

- GIVEN `language` is running
- WHEN `POST /interpret` receives a body without the `message` field
- THEN the response status is 422 (Unprocessable Entity)
- AND the response body contains a machine-readable error from FastAPI validation

#### Scenario: empty string message returns 422

- GIVEN `language` is running
- WHEN `POST /interpret` receives `{ "message": "" }`
- THEN the response status is 422 (Unprocessable Entity)

---

### Requirement: LLM-backed interpretation

When a valid `message` is received, `language` MUST:

1. Forward the message to the configured LLM via the `LLMInterpreter` port.
2. Receive a tool call response for `emit_intent` with flat fields
   `{ kind: string, minutes: int, confidence: float }`.
3. Validate the tool call result against the schema before constructing the
   HTTP response body.
4. Return `{ "intent": { "kind": "DELAY", "params": { "minutes": <int> } }, "confidence": <float> }`
   on success.

The route MUST depend on `LLMInterpreter` via FastAPI dependency injection.
Test code MUST be able to substitute `FakeInterpreter` without modifying
production modules.

#### Scenario: "llego 40 minutos tarde" → DELAY / minutes: 40

- GIVEN `language` is running with a real or fake interpreter
- WHEN `POST /interpret` receives `{ "message": "llego 40 minutos tarde" }`
- THEN the response status is 200
- AND `response.intent.kind` equals `"DELAY"`
- AND `response.intent.params.minutes` equals `40`
- AND `response.confidence` is a float in (0, 1]

#### Scenario: "media hora de retraso" → DELAY / minutes: 30

- GIVEN `language` is running with a real or fake interpreter
- WHEN `POST /interpret` receives `{ "message": "media hora de retraso" }`
- THEN the response status is 200
- AND `response.intent.params.minutes` equals `30`

#### Scenario: "un cuarto de hora tarde" → DELAY / minutes: 15

- GIVEN `language` is running with a real or fake interpreter
- WHEN `POST /interpret` receives `{ "message": "un cuarto de hora tarde" }`
- THEN the response status is 200
- AND `response.intent.params.minutes` equals `15`

#### Scenario: "llego en 30" → DELAY / minutes: 30

- GIVEN `language` is running with a real or fake interpreter
- WHEN `POST /interpret` receives `{ "message": "llego en 30" }`
- THEN the response status is 200
- AND `response.intent.params.minutes` equals `30`

#### Scenario: "voy tarde" (no duration) → DELAY with LOW confidence

- GIVEN `language` is running with a real or fake interpreter
- WHEN `POST /interpret` receives `{ "message": "voy tarde" }`
- THEN the response status is 200
- AND `response.intent.kind` equals `"DELAY"`
- AND `response.confidence` is a float strictly less than `0.7`
- AND `response.intent.params.minutes` is a positive integer (the LLM's best guess,
  reported honestly; Phase 3 does NOT block or clarify — see §Confidence)
- NOTE: the low-confidence response is returned to `scheduling` unchanged. No
  threshold enforcement happens in Phase 3. That is Phase 5.

---

### Requirement: Tool call schema — emit_intent

The LLM MUST be instructed to call the `emit_intent` tool. The tool schema defines
FLAT parameters (LLM reliability; nesting is introduced only at the HTTP boundary):

```
emit_intent(
  kind:       enum ["DELAY"]   — intent kind, UPPERCASE
  minutes:    integer >= 1     — delay in minutes
  confidence: number 0..1      — self-reported confidence
)
```

The adapter maps this flat tool output to the nested HTTP response shape:
`{ intent: { kind, params: { minutes } }, confidence }`.

This two-layer contract (flat at LLM boundary, nested at HTTP boundary) is a
deliberate decision (Decision 2 in the proposal). It MUST NOT be collapsed: the
tool schema stays flat to maximize LLM reliability; the HTTP envelope stays nested
to satisfy ADR-0005.

---

### Requirement: Output validation

The adapter MUST validate the LLM tool call output before constructing the HTTP
response. Validation rules:

- `kind` MUST be exactly `"DELAY"` (case-sensitive). Any other string is off-schema.
- `minutes` MUST be a positive integer (>= 1). Zero, negative, non-integer, or
  absent values are off-schema.
- `confidence` MUST be a float in [0, 1]. Out-of-range or absent values are
  off-schema.

If ANY field fails validation, the adapter MUST return an error — never coerce,
default, or fabricate a valid-looking result.

#### Scenario: off-schema kind is rejected — never coerced

- GIVEN the LLM returns a tool call with `kind = "CANCEL"` (not in the schema)
- WHEN the adapter validates the result
- THEN the service returns HTTP 502 with body `{ "error": "interpretation_failed" }`
- AND the response MUST NOT be HTTP 200
- AND the response MUST NOT contain a fabricated `DELAY` intent

#### Scenario: missing minutes field is rejected

- GIVEN the LLM returns a tool call without the `minutes` field
- WHEN the adapter validates the result
- THEN the service returns HTTP 502 with body `{ "error": "interpretation_failed" }`

#### Scenario: minutes = 0 is rejected

- GIVEN the LLM returns a tool call with `minutes = 0`
- WHEN the adapter validates the result
- THEN the service returns HTTP 502 with body `{ "error": "interpretation_failed" }`

#### Scenario: no tool call in LLM response is rejected

- GIVEN the LLM returns a text completion instead of a tool call
- WHEN the adapter processes the response
- THEN the service returns HTTP 502 with body `{ "error": "interpretation_failed" }`

---

### Requirement: Error and HTTP semantics

The service MUST return structured errors. HTTP status codes:

| Condition | HTTP status | Error body |
|---|---|---|
| Missing or empty `message` field | 422 | FastAPI validation detail |
| LLM returns off-schema / unknown kind / missing required field / no tool call | 502 | `{ "error": "interpretation_failed" }` |
| OpenRouter unreachable, timeout, or non-2xx from OpenRouter | 503 | `{ "error": "llm_unavailable" }` |
| `OPENROUTER_API_KEY` absent at runtime | 503 | `{ "error": "llm_unavailable" }` |

**Key invariant:** `language` MUST NEVER return HTTP 200 with a fabricated or
coerced intent. 200 means the LLM returned a schema-valid result that passed
validation. Anything else is an error.

**Note on downstream collapse:** `scheduling`'s `HttpLanguageAdapter` today maps
ALL non-2xx responses from `language` to `503 language_unavailable`. The 502/503
distinction in `language` is therefore transparent to the web client in Phase 3;
its value is observability and future refinement.

#### Scenario: LLM off-schema → 502 interpretation_failed

- GIVEN the LLM adapter raises a validation error (off-schema output)
- WHEN the route handles the error
- THEN the response status is 502
- AND the response body is `{ "error": "interpretation_failed" }`

#### Scenario: OpenRouter unavailable → 503 llm_unavailable

- GIVEN the OpenRouter endpoint is unreachable or returns a non-2xx status
- WHEN `POST /interpret` is called with a valid message
- THEN the response status is 503
- AND the response body is `{ "error": "llm_unavailable" }`

#### Scenario: missing API key at runtime → 503 llm_unavailable

- GIVEN `OPENROUTER_API_KEY` is not set in the environment
- WHEN `POST /interpret` is called with a valid message
- THEN the service fails fast and returns HTTP 503
- AND the response body is `{ "error": "llm_unavailable" }`
- AND the service does NOT crash the process

#### Scenario: LLM timeout → 503 llm_unavailable

- GIVEN the LLM call exceeds the language-side timeout (< 5 s, configured to fit
  within scheduling's 5 s AbortController)
- WHEN `POST /interpret` is called with a valid message
- THEN the response status is 503
- AND the response body is `{ "error": "llm_unavailable" }`

---

### Requirement: Confidence

`confidence` is a self-reported float in [0, 1] returned by the LLM as part of the
`emit_intent` tool call. The service MUST:

- Pass it through unchanged in the HTTP response body.
- NOT round, clamp, or modify it.
- NOT enforce any threshold. The ~0.7 threshold is documented as MACHINERY ONLY and
  is reserved for Phase 5.

Phase 3 reports confidence honestly. Low confidence (e.g., < 0.7) results are still
returned as HTTP 200 with the LLM's best-guess intent. The caller (`scheduling`)
passes it through to the domain unchanged (existing `PlanResponseDto.confidence`
passthrough — see interpret-pipeline spec).

#### Scenario: confidence passes through unchanged

- GIVEN the LLM reports `confidence = 0.42`
- WHEN the adapter maps the result
- THEN `response.confidence` equals `0.42`
- AND the value is NOT rounded, clamped, or modified

#### Scenario: low confidence is still a 200 (no enforcement in Phase 3)

- GIVEN the LLM reports `confidence = 0.31` with `kind = "DELAY"` and valid `minutes`
- WHEN `POST /interpret` processes the result
- THEN the response status is 200
- AND the body contains `{ "intent": { "kind": "DELAY", "params": { "minutes": <int> } }, "confidence": 0.31 }`
- AND NO 4xx or 5xx status is returned on confidence grounds alone

---

### Requirement: Hexagonal port — LLMInterpreter

The route MUST depend on an `LLMInterpreter` Protocol (port), not on any concrete
adapter. The port contract:

```
Protocol LLMInterpreter:
  async interpret(message: str) -> InterpretResult
    raises: LLMUnavailableError | InterpretationFailedError
```

Where `InterpretResult` is the validated, structured result equivalent to:
`{ kind: str, minutes: int, confidence: float }` (flat, pre-mapping).

- `LLMUnavailableError` maps to HTTP 503 `llm_unavailable`.
- `InterpretationFailedError` maps to HTTP 502 `interpretation_failed`.

Production wiring uses `OpenRouterInterpreter`. Test wiring uses `FakeInterpreter`
injected via FastAPI `Depends` override. The `openai` import MUST exist ONLY in the
`OpenRouterInterpreter` module — never in the route, port, or test modules.

#### Scenario: FakeInterpreter substitutes the production adapter in tests

- GIVEN a test overrides the `LLMInterpreter` dependency with `FakeInterpreter`
  configured to return `{ kind: "DELAY", minutes: 40, confidence: 0.95 }`
- WHEN `POST /interpret` receives `{ "message": "llego 40 minutos tarde" }`
- THEN the response is 200 with `intent.params.minutes = 40` and `confidence = 0.95`
- AND no network call to OpenRouter is made

#### Scenario: FakeInterpreter configured to raise LLMUnavailableError

- GIVEN `FakeInterpreter` is configured to raise `LLMUnavailableError`
- WHEN `POST /interpret` is called
- THEN the response is 503 with `{ "error": "llm_unavailable" }`

#### Scenario: FakeInterpreter configured to raise InterpretationFailedError

- GIVEN `FakeInterpreter` is configured to raise `InterpretationFailedError`
- WHEN `POST /interpret` is called
- THEN the response is 502 with `{ "error": "interpretation_failed" }`

---

### Requirement: Statelessness

`language` MUST hold no state between requests. Each call to `POST /interpret`
MUST be fully independent: no request context, session, or conversation history
is persisted. The LLM call for each request is a fresh, self-contained exchange.

#### Scenario: two sequential requests are independent

- GIVEN two back-to-back `POST /interpret` requests with different messages
- WHEN both are processed
- THEN neither response is influenced by the previous request
- AND the service does not maintain any in-memory conversation history

---

### Requirement: Configuration

The service MUST read the following environment variables via `pydantic-settings`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Yes (prod) | — | API key for OpenRouter; absence → fail-fast 503 at request time |
| `LLM_MODEL` | No | `anthropic/claude-haiku-4.5` | OpenRouter model slug |

A `.env.example` file MUST document both variables with placeholder values and a
comment explaining that the user supplies `OPENROUTER_API_KEY` (not committed; same
credential-handling pattern as `DATABASE_URL` in `scheduling`).

Unit tests MUST NOT require `OPENROUTER_API_KEY` — they use `FakeInterpreter`.
The live integration test MUST self-skip when `OPENROUTER_API_KEY` is absent
(mirrors the Phase 2 `describeIfDb` pattern).

#### Scenario: LLM_MODEL defaults to anthropic/claude-haiku-4.5

- GIVEN `LLM_MODEL` is not set in the environment
- WHEN the configuration is loaded
- THEN `config.llm_model` equals `"anthropic/claude-haiku-4.5"`

#### Scenario: LLM_MODEL is overridable via environment

- GIVEN `LLM_MODEL=anthropic/claude-opus-4-5` in the environment
- WHEN the configuration is loaded
- THEN `config.llm_model` equals `"anthropic/claude-opus-4-5"`

---

### Requirement: Test infrastructure

Phase 3 bootstraps the Python test infrastructure that does not currently exist
in `apps/language`.

Test dependencies (added to `pyproject.toml`):
- `pytest >= 8`
- `pytest-asyncio >= 0.23`
- `httpx >= 0.27` (ASGI test client)
- `openai >= 1.0`
- `pydantic-settings >= 2.0`

A `conftest.py` MUST:
- Register `FakeInterpreter` as the default `LLMInterpreter` override for all unit
  tests. No test should ever call `OpenRouterInterpreter` unless explicitly opting
  into the live integration test.

A live integration test MUST:
- Self-skip when `OPENROUTER_API_KEY` is absent.
- Call the real OpenRouter endpoint when the key is present.
- Assert at minimum: response is 200, `intent.kind == "DELAY"`, `minutes > 0`,
  `0 <= confidence <= 1`.

The `Makefile` MUST gain:
- `test-language`: runs the `apps/language` pytest suite.
- `test-scheduling`: runs the `apps/scheduling` Jest suite (renamed if currently
  named `test`).
- `test`: aggregate target that runs both `test-language` and `test-scheduling`.

#### Scenario: unit test suite runs without OPENROUTER_API_KEY

- GIVEN `OPENROUTER_API_KEY` is not set
- WHEN `make test-language` is executed
- THEN all unit tests PASS
- AND the live integration test is skipped (not failed)
- AND no network call is made

#### Scenario: live test runs when key is present

- GIVEN `OPENROUTER_API_KEY` is set to a valid key
- WHEN the live integration test runs
- THEN the test is NOT skipped
- AND it asserts the real LLM round-trip result

---

### Requirement: ADR-0014

A new ADR (`docs/adr/0014-llm-provider.md`, status: Accepted) MUST document the
following decisions:

- LLM gateway: OpenRouter (base URL `https://openrouter.ai/api/v1`)
- Default model: `anthropic/claude-haiku-4.5` (configurable via `LLM_MODEL`)
- Client SDK: `openai` Python SDK (OpenAI-compatible API)
- Structured output mechanism: tool/function calling
- Privacy tradeoff: doctor's message makes TWO hops (HealthSync → OpenRouter →
  Anthropic). This is a deliberate, documented tradeoff for MVP/teaching purposes.
- Rationale: model flexibility via one gateway key; Haiku is low-latency and
  cost-effective for simple intent extraction; OpenAI-compat reduces SDK surface.

ADR-0014 MUST reference ADR-0005 (intent schema), ADR-0007 (BFF), and ADR-0010
(LLM provider gap, now resolved).

---

### Requirement: Stale build artifact cleanup

The tracked artifact `apps/language/build/` (old main.py with no `/interpret`
route) MUST be removed from the repository and from git tracking.

A `.gitignore` entry MUST be added to `apps/language/` (or the root) covering:
`build/`, `*.egg-info`, `.venv`, `__pycache__`, `.pytest_cache`.

Removal MUST be done via `git rm -r` (not just `.gitignore`), because the
directory is currently tracked.

#### Scenario: build/ directory is absent after Phase 3

- GIVEN Phase 3 is applied
- WHEN `git ls-files apps/language/build/` is run
- THEN it outputs nothing (no tracked files under that path)

---

## On-disk structure (target state after Phase 3)

```
apps/language/
  app/
    main.py              # thin FastAPI route only; depends on LLMInterpreter
    config.py            # pydantic-settings: OPENROUTER_API_KEY, LLM_MODEL
    schemas.py           # Pydantic: InterpretRequest, InterpretResponse (tightened)
    interpreter/
      port.py            # LLMInterpreter Protocol + error types
      openrouter.py      # OpenRouterInterpreter adapter (openai import lives HERE only)
      fake.py            # FakeInterpreter for tests
  tests/
    conftest.py          # registers FakeInterpreter override
    test_interpret.py    # unit tests (all fake-based)
    test_openrouter_live.py  # live integration test (self-skips without key)
  pyproject.toml         # updated deps
  .env.example           # OPENROUTER_API_KEY + LLM_MODEL documented
  .gitignore             # build/, *.egg-info, .venv, __pycache__, .pytest_cache
```

---

## Isolation constraints

- `openai` MUST be imported ONLY in `app/interpreter/openrouter.py`. It MUST NOT
  appear in `main.py`, `port.py`, `fake.py`, or any test module.
- `app/main.py` MUST NOT import from `openrouter.py` directly. The route depends
  only on the `LLMInterpreter` Protocol.
- Tests MUST NOT import from `openrouter.py` directly (they use `FakeInterpreter`).

---

## Deferred (explicit out-of-scope for Phase 3)

| Item | Deferred to |
|---|---|
| `CANCEL_BLOCK` intent kind | Phase 5 |
| Any intent kind other than `DELAY` | Phase 5 |
| Clarification path (ask for missing duration) | Phase 5 |
| Confidence threshold enforcement (reject < 0.7) | Phase 5 |
| logprob-based confidence (LLM-computed vs self-reported) | Phase 5 |
| Raising the scheduling-side 5 s AbortController timeout | Phase 5 (flagged) |
| Plan confirmation, notifications, persistence | Phase 4 |

---

## Test runner

```bash
cd apps/language && pytest
# or from root:
make test-language
```

All unit scenarios in this spec MUST map to passing pytest tests under
`apps/language/tests/`. Live scenarios self-skip without `OPENROUTER_API_KEY`.
