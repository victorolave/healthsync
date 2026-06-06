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
