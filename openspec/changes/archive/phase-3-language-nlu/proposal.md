# Phase 3 — Language Service NLU: replace the DELAY stub with a real LLM brain

Phase 3 turns `apps/language` from a 27-line hard-coded stub into a real Natural
Language Understanding service. A doctor's free-text Spanish message
("llego 40 minutos tarde") is sent to an LLM through OpenRouter, which returns a
structured `DELAY` intent with minutes and a self-reported confidence. The HTTP
contract (`POST /interpret {message} → {intent:{kind,params}, confidence}`) does
not change — only the brain behind it. This phase also fills the provider/model
gap that ADR-0010 explicitly deferred, by introducing **ADR-0014**, and bootstraps
the Python test infrastructure that `apps/language` has never had.

## Intent

| Question | Answer |
|----------|--------|
| What problem | The language service returns a hard-coded `DELAY/15/1.0` for every message. There is no real understanding, no Spanish parsing, no honest confidence, and no test infrastructure. ADR-0010 chose "LLM with structured output" but deferred the provider/model to a future ADR that was never written. |
| Why now | Phases 1–2 built the consumer (scheduling domain + persistence). The domain can already act on intents but only ever receives a fake one. Phase 3 makes the supplier real so the end-to-end flow carries genuine NLU before Phase 4 wires confirm + notify. |
| What success looks like | `POST /interpret` returns a real `DELAY` intent extracted from Spanish by Claude Haiku 4.5 via OpenRouter, validated against the ADR-0005 `{kind, params}` contract, with a self-reported confidence. The LLM sits behind a hexagonal port so it is swappable and fakeable. Unit tests run offline with a fake; a guarded live test exercises the real provider. The contract envelope is byte-for-byte compatible with what scheduling already consumes. |

## Scope

### In scope

- Replace the hard-coded brain in `apps/language/app/main.py` with a real LLM interpretation path.
- Introduce a hexagonal seam: `LLMInterpreter` Protocol (port) + `OpenRouterInterpreter` adapter + `FakeInterpreter` for tests.
- OpenRouter integration via the `openai` Python SDK (OpenAI-compatible API), default model `anthropic/claude-haiku-4.5`, configurable via `LLM_MODEL`.
- Structured output via OpenAI-style tool/function calling; Pydantic schema; validation against ADR-0005 before the response leaves the service.
- Self-reported `confidence` float (0..1) as a field in the tool schema.
- Config via `pydantic-settings`; `.env.example` with `OPENROUTER_API_KEY` + `LLM_MODEL`.
- Spanish prompt design for `DELAY` minute-extraction (system prompt + few-shot anchors).
- Tighten the `IntentResponse` Pydantic model (the current `intent: dict` becomes a typed shape).
- Error/HTTP semantics that distinguish "bad interpretation" from "service failure".
- Bootstrap Python test infra: `pytest` + `pytest-asyncio` + `httpx`, a `tests/` dir, a `conftest.py`, a `test-language` Make target, and `make test` aggregating both apps.
- Write **ADR-0014** (LLM provider/model) — formalizing the deferred decision.
- Clean up the stale `apps/language/build/` artifact (gitignore or remove).

### Out of scope (Phase 5 boundary)

- **`CANCEL_BLOCK`** and any intent other than `DELAY`. DELAY only this phase.
- **The clarification path** — low-confidence "ask, don't guess" behavior. Phase 3 returns an honest confidence number but does NOT enforce a threshold or branch on it. The threshold is documented as machinery only; enforcement is Phase 5.
- **Logprob-based confidence.** Self-reported only; logprobs can be revisited in Phase 5.
- **Raising the scheduling-side 5s timeout.** Phase 3 flags the latency risk and may add a language-side timeout, but does not modify the scheduling adapter.
- **Propose-and-confirm, notifications, persistence-write.** Those are Phase 4.

## Approach

The service stays stateless (ADR-0010): the LLM interprets, it never plans. The
interpretation logic is isolated behind a single Python `Protocol` so the FastAPI
route depends on an abstraction, not on the `openai` SDK. This mirrors the
hexagonal style already established in scheduling (ADR-0002), keeps the adapter
swappable, and makes the route testable with a fake instead of `unittest.mock.patch`.

OpenRouter is the gateway (one API key, model flexibility) and exposes an
OpenAI-compatible API, so we use the `openai` SDK pointed at
`https://openrouter.ai/api/v1`. Structured output uses tool/function calling so
the model's response is schema-shaped at the API level, and Pydantic re-validates
against the ADR-0005 contract as the final gate before the response leaves the
service. Anything off-contract is rejected, not coerced.

---

## The 10 decisions

### 1. ADR-0014 — provider/model (fills the ADR-0010 gap)

**Decision:** Write `docs/adr/0014-llm-provider.md`. Number **0014 is confirmed** —
current ADRs run 0001–0013 with no gaps in the provider space. Status: Accepted.

**Content:** OpenRouter as the LLM gateway, default model
`anthropic/claude-haiku-4.5` (env-configurable via `LLM_MODEL`), accessed via the
`openai` SDK against OpenRouter's OpenAI-compatible API. Structured output via tool
calling. This is the "smaller, separate decision" ADR-0010 deferred.

**Rationale to capture:** model flexibility through one gateway, a single API key,
OpenAI-compatibility (one SDK, swappable models), and Haiku 4.5's
low-latency/low-cost profile fitting simple Spanish DELAY extraction.

**Privacy tradeoff to document (ADR-0010 flagged it):** with OpenRouter the
doctor's message makes **TWO hops** — client → OpenRouter → underlying provider —
versus one hop with a direct provider. Acceptable for an MVP/teaching project
(scheduling logistics, not deep clinical data; doctor confirmation gate is the
ultimate safety net per D1), but recorded as a deliberate tradeoff.

### 2. Tool/function schema — the exact shape the LLM must return

The LLM is given one tool, `emit_intent`, whose parameters are the contract:

```json
{
  "name": "emit_intent",
  "parameters": {
    "type": "object",
    "properties": {
      "kind":       { "type": "string", "enum": ["DELAY"] },
      "minutes":    { "type": "integer", "minimum": 1 },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
    },
    "required": ["kind", "minutes", "confidence"]
  }
}
```

**Flat at the tool boundary, nested at the HTTP boundary.** The tool schema is flat
(`kind`, `minutes`, `confidence`) because LLM tool-calling is more reliable with
flat parameters than deeply nested objects. The adapter then maps the flat tool
output into the ADR-0005 envelope:

```json
{ "intent": { "kind": "DELAY", "params": { "minutes": 40 } }, "confidence": 0.94 }
```

`kind` is constrained to `enum: ["DELAY"]` this phase (Phase 5 widens the enum).
`minutes` is a positive integer.

**Pydantic validation (two layers):**
- A `ToolOutput` model validates the raw tool arguments (kind in the allowed set, minutes ≥ 1, confidence in [0,1]).
- The adapter maps `ToolOutput` → the tightened `IntentResponse` model (`intent: Intent` where `Intent = {kind: str, params: dict}`, `confidence: float`) which is what FastAPI serializes.

**Off-schema / unknown kind:** if the model returns no tool call, malformed
arguments, an unknown `kind`, or `minutes` missing/invalid, `ToolOutput` validation
raises and the route returns a service error (see Decision 3) — never a coerced or
guessed intent.

### 3. Validation-failure & error handling — HTTP semantics

The consumer (`HttpLanguageAdapter`) must be able to tell "the doctor wrote
something I couldn't interpret" apart from "the language brain broke". We map that
to distinct statuses:

| Situation | Language HTTP status | Body | Rationale |
|-----------|---------------------|------|-----------|
| Missing `message` field in request | 422 | FastAPI/Pydantic default | Request-validation failure; unchanged from today. |
| LLM returns off-schema / unknown kind / un-interpretable | **502 Bad Gateway** | `{ "error": "interpretation_failed" }` | The upstream brain produced something we can't honor. It is NOT the doctor's request that is structurally invalid (that would be 422 on `/interpret` input) — it is the model's output. 502 marks "bad upstream response". |
| OpenRouter unreachable / non-2xx / timeout | **503 Service Unavailable** | `{ "error": "llm_unavailable" }` | The dependency is down or slow. Matches the "unavailable" semantics scheduling already understands. |
| Missing `OPENROUTER_API_KEY` at runtime | **503** | `{ "error": "llm_unavailable" }` | Treated as the dependency being unconfigured/unavailable; fail fast and honestly. |

**Why this matters to scheduling:** the scheduling adapter currently maps **any**
failure (network error, timeout, non-2xx) to a single `503 language_unavailable`.
So in practice 502 and 503 from language both surface to the web client as
`503 language_unavailable` today. That is acceptable for Phase 3 — the distinction
is recorded for observability and for a future Phase where scheduling may
differentiate. The key correctness property: **language never returns 200 with a
fabricated intent.** A failure is always a non-2xx.

> Note for spec/design: we do NOT use 422 for *LLM* output failures, to avoid
> colliding with FastAPI's request-validation 422 and to keep "the model misbehaved"
> distinct from "your request body was malformed".

### 4. Confidence semantics

`confidence` is a **self-reported float in [0,1]** emitted by the model in the tool
call (aligns with ADR-0010's "the LLM provides a confidence signal"). Phase 3
returns it honestly and unchanged — scheduling already passes it through unmodified
to `PlanResponseDto`.

A default threshold of **~0.7** is documented as **machinery only**: it is the
intended cutoff for the Phase 5 clarification path ("below threshold → ask, don't
guess"). **Phase 3 does NOT enforce it** — no branching, no clamping, no rejection
based on confidence. The number is reported; enforcement is Phase 5's job.

### 5. The 5s timeout concern

The scheduling `HttpLanguageAdapter` has a hard **5s `AbortController`**; any
failure (including abort) becomes `503 language_unavailable`. Haiku 4.5 is fast,
but OpenRouter adds a gateway hop, so the round-trip is `scheduling → language →
OpenRouter → Anthropic → back`.

**Phase 3 action:** add a language-side timeout on the OpenRouter call (configurable,
default a few seconds, comfortably under 5s) so the language service fails as a
clean `503 llm_unavailable` rather than letting the scheduling AbortController fire
mid-flight. **Flag (do NOT fix):** the scheduling 5s budget may prove too tight once
real latency is observed; raising it is explicitly out of scope and noted as a
follow-up risk for a later phase. Phase 3 does not touch the scheduling adapter.

### 6. FastAPI hexagonal layout

```
apps/language/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app + /health + /interpret route (thin)
│   ├── config.py               # pydantic-settings Settings (OPENROUTER_API_KEY, LLM_MODEL, timeout)
│   ├── schemas.py              # InterpretRequest, IntentResponse, Intent, ToolOutput (Pydantic)
│   └── interpreter/
│       ├── __init__.py
│       ├── port.py             # LLMInterpreter Protocol (the port)
│       ├── openrouter.py       # OpenRouterInterpreter adapter (openai SDK + tool call + prompt)
│       └── fake.py             # FakeInterpreter for tests (canned responses)
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # fixtures: TestClient with FakeInterpreter injected
│   ├── test_interpret.py       # route tests via fake (happy path + error mapping)
│   └── test_openrouter_live.py # live integration test, self-skips without OPENROUTER_API_KEY
├── .env.example                # OPENROUTER_API_KEY=, LLM_MODEL=anthropic/claude-haiku-4.5
└── pyproject.toml
```

The route depends on the `LLMInterpreter` Protocol via FastAPI dependency
injection (`Depends`). Production wiring returns the `OpenRouterInterpreter`; tests
override the dependency with a `FakeInterpreter`. The `openai` SDK import lives ONLY
in `openrouter.py` — nothing else knows the provider exists.

### 7. Spanish handling

**Prompt design:** a **Spanish system prompt** instructing the model that it
interprets a doctor's scheduling message and must call `emit_intent` with a `DELAY`
kind, the delay in `minutes`, and an honest `confidence`. Reinforced with a small
set of **few-shot anchors** for Spanish idioms so numeric and idiomatic durations
map correctly. The doctor's message is passed as a user turn (not a system
instruction), which lowers prompt-injection surface.

**Concrete acceptance cases (DELAY only):**

| Spanish message | Expected |
|-----------------|----------|
| "llego 40 minutos tarde" | DELAY, minutes=40 |
| "Tuve una urgencia, voy a llegar 40 minutos tarde" | DELAY, minutes=40 |
| "Voy a llegar 15 minutos tarde" | DELAY, minutes=15 |
| "media hora de retraso" | DELAY, minutes=30 |
| "un cuarto de hora tarde" | DELAY, minutes=15 |
| "se me complicó la cirugía, llego en 30" | DELAY, minutes=30 |
| "voy tarde" (no duration) | DELAY, low confidence (Phase 3 reports it; Phase 5 asks) |

These become live-integration assertions (guarded) and shape the few-shot anchors.
The fake-based unit tests assert the route/error machinery, not the model's Spanish
skill (that needs the real model).

### 8. Test infra bootstrap

**`pyproject.toml` additions** (a `[project.optional-dependencies] dev` group or
direct dev deps):

```
pytest>=8.0
pytest-asyncio>=0.23
httpx>=0.27          # FastAPI TestClient transport
openai>=1.0          # OpenRouter via OpenAI-compatible API
pydantic-settings>=2.0
```

**Test layout:** `tests/` with `conftest.py` providing a `TestClient` whose
`LLMInterpreter` dependency is overridden by `FakeInterpreter`. Unit tests cover:
happy-path DELAY, off-schema → 502, LLM-unavailable → 503, missing-message → 422.
The live test (`test_openrouter_live.py`) self-skips via
`pytest.mark.skipif(not os.getenv("OPENROUTER_API_KEY"))` — mirrors the scheduling
`describeIfDb` int-spec pattern.

**Makefile:**
- Add `test-language`: `cd apps/language && .venv/bin/pytest`.
- Add `test-scheduling` (extract the current `test` body).
- Change `test` to aggregate: `test: test-scheduling test-language`.
- Update `.PHONY` accordingly.

### 9. `build/` cleanup

`apps/language/build/lib/app/` is a stale setuptools artifact (an old `main.py` with
only `/health`, no `/interpret`) that risks confusion. **Decision:** add `build/`
(and `*.egg-info/`, `.venv/`, `__pycache__/`, `.pytest_cache/`) to a
`apps/language/.gitignore` AND remove the tracked `build/` artifact from the working
tree so it stops shadowing the real source. Prefer removal + ignore over ignore-only.

### 10. OpenRouter specifics

- **API key:** read via `pydantic-settings` (`Settings.openrouter_api_key`), loaded
  from `.env` in dev. **No key committed** — `.env.example` documents the variable;
  the user supplies the real key (same credential pattern as the Neon DB URL). Unit
  tests use the fake; the live test self-skips when the key is absent, so
  `make install` / apply build fully **offline**.
- **Attribution headers (optional):** OpenRouter supports `HTTP-Referer` and
  `X-Title` for dashboard attribution. Include them as optional, configurable
  defaults (e.g. `X-Title: HealthSync`) — nice-to-have, not required for function.
- **Missing key at runtime:** if no key is configured when a real interpretation is
  attempted, fail fast with `503 llm_unavailable` (Decision 3) rather than calling
  the SDK with an empty key.

---

## ADR-0014 plan (summary)

| Field | Value |
|-------|-------|
| File | `docs/adr/0014-llm-provider.md` |
| Number | 0014 (confirmed: current ADRs 0001–0013) |
| Status | Accepted |
| Title | LLM provider and model |
| Decision | OpenRouter gateway + default `anthropic/claude-haiku-4.5`, via `openai` SDK against the OpenAI-compatible API; structured output by tool calling. |
| Drivers | Model flexibility via one gateway; one API key; OpenAI-compat (one SDK, swappable); Haiku's low latency/cost for simple Spanish DELAY extraction. |
| Tradeoff | Privacy: message makes TWO hops (OpenRouter → underlying provider). Accepted for MVP/teaching; doctor confirmation gate (D1) is the safety net. |
| References | ADR-0010 (mechanism, deferred this), ADR-0005 (intent contract), ADR-0007 (sync REST + 5s timeout). |

This ADR resolves the single biggest blocker the exploration flagged. With it, spec
and design can proceed.

## Risks

| Risk | Severity | Note |
|------|----------|------|
| 5s scheduling timeout vs OpenRouter latency hop | HIGH | Validate real p99. Phase 3 adds a language-side timeout < 5s; raising the scheduling budget is a flagged follow-up, not fixed here. |
| LLM nondeterminism in CI | MEDIUM | Unit tests use the fake (deterministic); the live test self-skips without a key, so CI does not cover the real model path. |
| Self-reported confidence may be poorly calibrated | MEDIUM | Sufficient for Phase 3 (reporting only). Logprob calibration deferred to Phase 5 if needed. |
| Privacy two-hop | MEDIUM | Documented in ADR-0014 as a deliberate tradeoff; acceptable for non-clinical scheduling logistics. |
| 502 vs 503 collapses to 503 at the web client today | LOW | Scheduling maps all failures to 503; the distinction is for observability and a future scheduling refinement. |
| Prompt injection from free-text message | LOW | Message is a user turn, not a system instruction; tool-calling boundary mitigates. Logistics context, low severity. |
| Per-call LLM cost | LOW | Teaching project; Haiku is cheap. Note in ADR. |

## Size estimate

**Medium.** Roughly **250–350 changed lines** across ~10 files. Net-new modules
(port, adapter, fake, config, schemas, prompt) plus the test bootstrap and ADR-0014.
The `main.py` rewrite is small; the bulk is the adapter + prompt + tests + the new
test infrastructure (which never existed). No scheduling/web changes. This fits a
single PR comfortably under the 400-line budget; the one watch item for sdd-tasks is
whether prompt iteration + live-test assertions push the test file count up.
