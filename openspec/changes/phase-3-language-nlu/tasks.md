# Tasks: Phase 3 — Language NLU

Delivery strategy: `single-pr` (cached).
Test mode: Standard Mode (NOT strict TDD — language only; strict TDD is scheduling-only).
Test runner: `cd apps/language && .venv/bin/pytest`

---

## Review Workload Forecast

| Metric | Estimate |
|---|---|
| New files | 14 (config.py, schemas.py, errors.py, interpreter/__init__.py, port.py, prompt.py, openrouter.py, fake.py, tests/__init__.py, conftest.py, test_schemas.py, test_interpret_route.py, test_openrouter_live.py, .env.example) |
| Edited files | 3 (pyproject.toml, app/main.py, Makefile) |
| Removed files | 1 (apps/language/build/ — git rm if tracked) |
| New ADR file | 1 (docs/adr/0014-llm-provider.md) |
| Total files touched | 19 |
| Estimated changed lines | ~320–360 |
| 400-line budget risk | **Low-Medium** (under budget; prompt.py + adapter are the longest units ~80 lines combined) |
| Chained PRs recommended | No — fits comfortably in a single PR |
| Decision needed before apply | No |

---

## Dependency graph (sequential spine)

```
T1 → T2 → T3 → T4 → T5 → T6
                              ↘
                           T7 (parallel with T5/T6 after T4)
                           T8 (parallel with T5/T6 after T2)
                           T9 (parallel with T5/T6 after T5)
```

Detailed ordering and parallelism noted per task below.

---

## Work Unit 1 — Bootstrap (pyproject.toml + test infra)

### T1 — Edit `pyproject.toml`: add runtime + dev deps and pytest config

**File:** `apps/language/pyproject.toml`
**What it does:** Add `openai>=1.0` and `pydantic-settings>=2.0` to `dependencies`; add
`[project.optional-dependencies] dev = [pytest>=8, pytest-asyncio>=0.23, httpx>=0.27]`;
add `[tool.pytest.ini_options] asyncio_mode = "auto"`, `testpaths = ["tests"]`.
**Driving spec:** Requirement: Test infrastructure (pyproject.toml additions).
**Driving test:** `make install-language` (installs `[dev]` extra); `cd apps/language && .venv/bin/pytest --collect-only` must not error after T2.
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** None — this is the root task.
**Commit message:** `build(language): add openai + pydantic-settings deps and pytest config`

---

## Work Unit 2 — Core domain types (schemas, errors, config, port, fake)

These tasks form the offline-testable foundation. T2–T5 must precede T6 (adapter) and T7 (route
rewrite) because both depend on the types they define.

### T2 — Create `app/schemas.py`

**File:** `apps/language/app/schemas.py` (NEW — replaces the inline models in main.py)
**What it creates:**
- `InterpretRequest(BaseModel)` with `message: str = Field(min_length=1)` — blank → 422.
- `ToolOutput(BaseModel, model_config extra=forbid)` with `kind: Literal["DELAY"]`,
  `minutes: int = Field(ge=1)`, `confidence: float = Field(ge=0.0, le=1.0)`.
- `Intent(BaseModel)` with `kind: str`, `params: dict`.
- `IntentResponse(BaseModel)` with `intent: Intent`, `confidence: float`.
- `tool_output_to_response(out: ToolOutput) -> IntentResponse` mapper.
**Driving spec:** Requirement: Tool call schema; Requirement: Output validation; Requirement: POST /interpret endpoint (envelope shape).
**Driving test:** `tests/test_schemas.py` (created in T8) — validates ToolOutput rejects bad minutes/kind/confidence; mapper produces the nested envelope.
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** T1 (pydantic-settings must be installable; pydantic already present).
**Commit message:** (bundled with T3–T5 into one work-unit commit — see Work Unit 2 note)

### T3 — Create `app/errors.py`

**File:** `apps/language/app/errors.py` (NEW)
**What it creates:**
- `InterpretationError(Exception)` — bad LLM output → 502.
- `LLMUnavailableError(Exception)` — provider down/timeout/missing key → 503.
**Design note:** Must live in its own module (not in adapter or main.py) to avoid circular imports;
both adapter (raises) and main.py (catches) import it.
**Driving spec:** Requirement: Error and HTTP semantics.
**Driving test:** Used by conftest.py (T8) and test_interpret_route.py (T9).
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** None (pure Python, no imports from other new files).
**Commit message:** (bundled with T2, T4, T5)

### T4 — Create `app/config.py`

**File:** `apps/language/app/config.py` (NEW)
**What it creates:**
- `Settings(BaseSettings)` with `openrouter_api_key: str = ""`, `llm_model: str = "anthropic/claude-haiku-4.5"`, `request_timeout: float = 4.0`; `SettingsConfigDict(env_file=".env", extra="ignore")`.
- `@lru_cache get_settings() -> Settings`.
**Driving spec:** Requirement: Configuration (LLM_MODEL defaults, override via env, fail-fast on missing key).
**Driving test:** Covered by test_interpret_route.py (T9) — the default is exercised when no env var is set.
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** T1 (pydantic-settings runtime dep).
**Commit message:** (bundled with T2, T3, T5)

### T5 — Create `app/interpreter/port.py` and `app/interpreter/fake.py` + package init

**Files:**
- `apps/language/app/interpreter/__init__.py` (NEW, empty)
- `apps/language/app/interpreter/port.py` (NEW) — `LLMInterpreter(Protocol)` with `async def interpret(self, message: str) -> IntentResponse`.
- `apps/language/app/interpreter/fake.py` (NEW) — `FakeInterpreter` with `__init__(response: IntentResponse | None = None, raises: Exception | None = None)` and `async def interpret(...)` that either raises or returns the canned response.
**Driving spec:** Requirement: Hexagonal port — LLMInterpreter; FakeInterpreter substitution scenarios.
**Driving test:** `tests/conftest.py` (T8) and all route tests (T9) depend on FakeInterpreter.
**Isolation constraint:** port.py and fake.py MUST NOT import `openai`.
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** T2 (IntentResponse used in port/fake type signatures), T3 (errors used in fake raises).
**Commit message:** `feat(language): add domain types, errors, config and hexagonal port+fake`
*(This is the bundle commit for T2–T5 — all offline-testable foundation in one work unit.)*

---

## Work Unit 3 — Prompt module

### T6 — Create `app/interpreter/prompt.py`

**File:** `apps/language/app/interpreter/prompt.py` (NEW)
**What it creates:**
- `SYSTEM_PROMPT` — Spanish system prompt instructing the LLM to always call `emit_intent`,
  convert idioms (media hora=30, un cuarto=15, etc.), report honest confidence, with two
  few-shot anchors ("llego 40 minutos tarde"→40/0.96, "voy tarde"→10/0.30).
- `EMIT_INTENT_TOOL` — Python dict in OpenAI tools format: `type=function`, name=`emit_intent`,
  flat parameters `{ kind: enum["DELAY"], minutes: integer min 1, confidence: number 0..1 }`,
  `required: [kind, minutes, confidence]`, `additionalProperties: false`.
- `_TOOL_CHOICE` constant — `{"type": "function", "function": {"name": "emit_intent"}}`.
**Driving spec:** Requirement: Tool call schema (flat, forced tool_choice); LLM-backed interpretation (idiom conversion, few-shot anchors).
**Driving test:** Exercised transitively through T7 (adapter) tests and T10 (live test). Reviewable as a standalone unit.
**OPENROUTER_API_KEY needed:** No (the module is a pure data definition).
**Sequential dependency:** T5 (logically after the package init, though technically standalone).
**Commit message:** `feat(language): add Spanish system prompt and emit_intent tool schema`

---

## Work Unit 4 — Adapter (the only openai-importing file)

### T7 — Create `app/interpreter/openrouter.py`

**File:** `apps/language/app/interpreter/openrouter.py` (NEW)
**What it creates:** `OpenRouterInterpreter` adapter — the ONLY file in the codebase that imports
`openai`. Key behaviors:
- `__init__(settings: Settings)`: if `settings.openrouter_api_key` is empty, set `self._client = None` (fail-fast on interpret call). Otherwise build `AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=..., timeout=settings.request_timeout)` with `HTTP-Referer` and `X-Title` headers.
- `async interpret(message: str) -> IntentResponse`:
  1. Raise `LLMUnavailableError` immediately if `self._client is None`.
  2. Call `chat.completions.create` with `SYSTEM_PROMPT` (system), `message` (user), `tools=[EMIT_INTENT_TOOL]`, `tool_choice=_TOOL_CHOICE`; catch `APITimeoutError / APIConnectionError / APIError` → `LLMUnavailableError`.
  3. Check `tool_calls` not empty; JSON-parse `function.arguments`; `ToolOutput.model_validate(raw)` — any failure → `InterpretationError`.
  4. Return `tool_output_to_response(validated)`.
**Isolation constraint:** Only this file imports `openai`. Route, port, fake, and ALL tests must never import it.
**Driving spec:** Requirement: LLM-backed interpretation; Requirement: Output validation; Requirement: Error and HTTP semantics; timeout 4.0s.
**Driving test:** `tests/test_openrouter_live.py` (T10) is the only test that exercises this file directly. Route tests (T9) bypass it via FakeInterpreter.
**OPENROUTER_API_KEY needed:** No for unit tests (bypassed by fake). YES for the live test (T10).
**Sequential dependency:** T4 (Settings), T5 (port.py + errors.py), T6 (prompt.py + tool schema), T2 (ToolOutput + mapper).
**Commit message:** `feat(language): add OpenRouterInterpreter adapter (openai isolation boundary)`

---

## Work Unit 5 — Route rewrite

### T8 — Rewrite `app/main.py`

**File:** `apps/language/app/main.py` (REWRITE — replaces the 27-line stub)
**What it does:**
- Remove the inline `InterpretRequest` / `IntentResponse` models (now in schemas.py).
- Import from `app.schemas`, `app.config`, `app.interpreter.port`, `app.interpreter.openrouter`, `app.errors`.
- Add `@lru_cache get_interpreter() -> LLMInterpreter` returning `OpenRouterInterpreter(get_settings())`.
- Rewrite `POST /interpret` to use `interpreter: LLMInterpreter = Depends(get_interpreter)`, call `await interpreter.interpret(body.message)`, and map `InterpretationError → 502 interpretation_failed`, `LLMUnavailableError → 503 llm_unavailable`.
- Preserve `GET /health` unchanged.
**Driving spec:** Requirement: POST /interpret endpoint; Requirement: Error and HTTP semantics; Requirement: Hexagonal port (Depends injection).
**Driving test:** `tests/test_interpret_route.py` (T9) — all 200/422/502/503 route scenarios, plus the envelope shape assertion.
**OPENROUTER_API_KEY needed:** No (tests override via dependency_overrides).
**Sequential dependency:** T2 (schemas), T3 (errors), T4 (config), T5 (port + fake), T7 (adapter imported only here in prod path).
**Commit message:** (bundled with T9 — route + route tests as one work unit)

---

## Work Unit 6 — Test files

### T9 — Create `tests/` directory, `conftest.py`, `test_schemas.py`, `test_interpret_route.py`

**Files:**
- `apps/language/tests/__init__.py` (NEW, empty)
- `apps/language/tests/conftest.py` (NEW):
  - `client_with(monkeypatch)` fixture: sets `app.dependency_overrides[get_interpreter] = lambda: fake`; yields the factory; clears overrides on teardown.
- `apps/language/tests/test_schemas.py` (NEW — pure unit, no HTTP client):
  - `ToolOutput` accepts valid args.
  - `ToolOutput` rejects `kind="CANCEL"` (unknown kind).
  - `ToolOutput` rejects `minutes=0` (ge=1 constraint).
  - `ToolOutput` rejects `confidence=1.5` (out-of-range).
  - `ToolOutput` rejects extra fields (`extra=forbid`).
  - `tool_output_to_response` produces nested envelope `{ intent: { kind, params: { minutes } }, confidence }`.
  - `confidence=0.42` passes through unchanged (no rounding).
- `apps/language/tests/test_interpret_route.py` (NEW — TestClient + dependency_overrides):
  - Happy path × 5 acceptance cases (fake returns canned IntentResponse per case):
    - "llego 40 minutos tarde" → 200, kind=DELAY, minutes=40, confidence high.
    - "media hora de retraso" → 200, minutes=30.
    - "un cuarto de hora tarde" → 200, minutes=15.
    - "llego en 30" → 200, minutes=30.
    - "voy tarde" → 200, confidence < 0.7.
  - Missing `message` → 422.
  - Blank `message` (`""`) → 422.
  - Fake raises `InterpretationError` → 502, body `{ "error": "interpretation_failed" }`.
  - Fake raises `LLMUnavailableError` → 503, body `{ "error": "llm_unavailable" }`.
  - Envelope shape assertion: every 200 response has `intent.kind`, `intent.params.minutes`, `confidence`.
**Driving spec:** Requirement: Test infrastructure; all acceptance scenarios; Requirement: Error and HTTP semantics (fake paths).
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** T8 (route must exist to test it), T5 (FakeInterpreter).
**Commit message:** `feat(language): wire interpret route + test suite (offline, fake-based)`
*(Bundles T8 + T9 — route and its tests ship together as one verifiable work unit.)*

### T10 — Create `tests/test_openrouter_live.py`

**File:** `apps/language/tests/test_openrouter_live.py` (NEW)
**What it creates:**
- `pytestmark = pytest.mark.skipif(not os.getenv("OPENROUTER_API_KEY"), reason="...")`.
- One test: construct `OpenRouterInterpreter(get_settings())` directly; call `await instance.interpret("llego 40 minutos tarde")`; assert `result.intent.kind == "DELAY"`, `result.intent.params["minutes"] == 40`, `0 <= result.confidence <= 1`.
**Driving spec:** Requirement: Test infrastructure (live self-skip scenario).
**OPENROUTER_API_KEY needed:** YES — this is the ONLY task that requires it. Self-skips when absent.
**Sequential dependency:** T7 (OpenRouterInterpreter must exist), T4 (Settings).
**Commit message:** `test(language): add live OpenRouter integration test (self-skips without key)`

---

## Work Unit 7 — Configuration artifacts

These are independent of the code paths above; they can proceed in parallel with Work Units 5–6
once T1 is done.

### T11 — Add `apps/language/.env.example`

**File:** `apps/language/.env.example` (NEW)
**What it creates:**
```
# Copy to .env and fill in your OpenRouter API key.
# .env is git-ignored (see root .gitignore); only .env.example is committed.
OPENROUTER_API_KEY=
LLM_MODEL=anthropic/claude-haiku-4.5
```
**Driving spec:** Requirement: Configuration (.env.example documents both variables).
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** T1 (conceptually after the dep bootstrap; can be done any time after T1).
**Commit message:** (bundled with T12)

### T12 — Clean up stale `apps/language/build/` artifact

**Action:**
1. Run `git ls-files apps/language/build/` to check tracking status.
2. If tracked (files listed): `git rm -r --cached apps/language/build/` then delete the directory from disk.
3. If untracked (no output): delete the directory from disk only.
4. Do NOT touch `.gitignore` — the root `.gitignore` already covers `build/`, `.env`, `.venv`, `__pycache__`, `*.egg-info` (confirmed lines 6–27).
**Driving spec:** Requirement: Stale build artifact cleanup.
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** None (mechanical git/file operation).
**Commit message:** `chore(language): remove stale build/ artifact and add .env.example`
*(Bundles T11 + T12.)*

---

## Work Unit 8 — ADR

### T13 — Create `docs/adr/0014-llm-provider.md`

**File:** `docs/adr/0014-llm-provider.md` (NEW — number 0014 confirmed; current ADRs are 0001–0013)
**Use template at:** `docs/adr/template.md`
**What it documents:**
- Title: `0014. LLM provider and model`
- Status: Accepted — Date: 2026-06-06
- Context: ADR-0010 deferred the specific LLM provider/model; Phase 3 fills that gap.
- Decision: OpenRouter gateway (base_url `https://openrouter.ai/api/v1`) + `openai` Python SDK + tool/function calling; default model `anthropic/claude-haiku-4.5` (overridable via `LLM_MODEL`).
- Privacy tradeoff: TWO network hops (HealthSync → OpenRouter → Anthropic); accepted for MVP/teaching scope; explicitly documented here as flagged in ADR-0010.
- Options considered: A) OpenRouter+openai (chosen), B) Anthropic direct, C) OpenAI direct.
- References: ADR-0010 (NLU mechanism — deferred this), ADR-0005 (intent contract), ADR-0007 (BFF + timeout consequence).
**ADR index/README:** No `docs/adr/README.md` exists — no update needed.
**Driving spec:** Requirement: ADR-0014.
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** None — docs can be written at any point.
**Commit message:** `docs(adr): add 0014-llm-provider (OpenRouter + Haiku 4.5 + openai SDK)`

---

## Work Unit 9 — Makefile

### T14 — Edit `Makefile`: split `test` and add `test-language`, `install-language [dev]`

**File:** `Makefile` (EDIT)
**Current state:** `test:` runs `cd $(SCHEDULING_DIR) && $(PNPM) test` (scheduling-only).
**Changes:**
- Add `test-scheduling:` target: `cd $(SCHEDULING_DIR) && $(PNPM) test` (same body as current `test:`).
- Replace current `test:` body with `test: test-scheduling test-language ## Run all app tests (scheduling + language)`.
- Add `test-language:` target: `cd $(LANGUAGE_DIR) && .venv/bin/pytest`.
- Edit `install-language:` to install with `[dev]` extra: change `$(VENV)/bin/pip install -e $(LANGUAGE_DIR)` → `$(VENV)/bin/pip install -e "$(LANGUAGE_DIR)[dev]"`.
- Update `.PHONY` to include `test-scheduling test-language`.
**Driving spec:** Requirement: Test infrastructure (Makefile targets — test-language, test, install-language dev extra).
**OPENROUTER_API_KEY needed:** No.
**Sequential dependency:** T9 (the test-language target must work; confirms the suite is passing first).
**Commit message:** `build: add test-language target, split test into scheduling+language, add install-language dev extra`

---

## Ordered execution sequence (dependency-respecting)

```
T1                          # pyproject deps — root
 ├─ T2 (schemas)
 ├─ T3 (errors)
 └─ T4 (config)
     └─ T5 (port + fake)   # requires T2 + T3
         ├─ T6 (prompt)    # independent of fake but after package init
         │   └─ T7 (adapter / openrouter.py)  # requires T2+T3+T4+T5+T6
         │       └─ T10 (live test)           # requires T7+T4
         ├─ T8 (main.py rewrite)              # requires T2+T3+T4+T5+T7
         │   └─ T9 (route tests)              # requires T8+T5
         │       └─ T14 (Makefile)            # requires T9 (suite must pass)
         └─ T11+T12 (env.example + cleanup)   # parallel after T1, no blocking dep
T13 (ADR-0014)              # fully independent, any time
```

### Parallelism notes

- **T2, T3, T4** can be written in parallel with each other (no inter-dependency).
- **T5** must wait for T2 and T3.
- **T6** can start after T5 (package init exists); it has no blocking code dependency but belongs after the interpreter package is created.
- **T7** is the sequential gate — requires T2+T3+T4+T5+T6 all done.
- **T8 + T9** are bundled; T8 requires T7 to exist (imported), T9 requires T8.
- **T10** requires T7 and T4.
- **T11 + T12** can run at any point after T1 (independent of all code tasks).
- **T13** is fully independent and can be authored in parallel with any task.
- **T14** logically last (confirms the full suite passes first).

---

## Tasks that require OPENROUTER_API_KEY

**Only T10** (`test_openrouter_live.py` execution) requires `OPENROUTER_API_KEY`.
All other 13 tasks are fully offline. The file itself can be written without the key;
it self-skips when absent.

---

## Summary

| # | Task | Work Unit | Type | Blocking dep |
|---|---|---|---|---|
| T1 | Edit pyproject.toml | 1 | Edit | — |
| T2 | Create app/schemas.py | 2 | New | T1 |
| T3 | Create app/errors.py | 2 | New | — |
| T4 | Create app/config.py | 2 | New | T1 |
| T5 | Create interpreter/__init__.py + port.py + fake.py | 2 | New | T2, T3 |
| T6 | Create interpreter/prompt.py | 3 | New | T5 |
| T7 | Create interpreter/openrouter.py | 4 | New | T2, T3, T4, T5, T6 |
| T8 | Rewrite app/main.py | 5 | Rewrite | T2, T3, T4, T5, T7 |
| T9 | Create tests/ + conftest.py + test_schemas.py + test_interpret_route.py | 6 | New | T5, T8 |
| T10 | Create test_openrouter_live.py | 6 | New | T4, T7 |
| T11 | Add .env.example | 7 | New | T1 |
| T12 | Clean up build/ artifact | 7 | Delete/git rm | — |
| T13 | Write docs/adr/0014-llm-provider.md | 8 | New | — |
| T14 | Edit Makefile | 9 | Edit | T9 |

**Total: 14 tasks across 9 work units.**
Sequential spine: T1 → T2/T3/T4 → T5 → T6 → T7 → T8 → T9 → T14.
Fully parallel: T3, T11, T12, T13 (no blocking dependencies).
