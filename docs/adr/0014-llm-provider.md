# ADR-0014 — LLM Provider Strategy

**Status:** Accepted
**Date:** 2026-06-06
**Refs:** ADR-0010 (defers this decision), ADR-0005 (intent contract), ADR-0007 (inter-service timeout)

---

## Context

ADR-0010 explicitly deferred the choice of LLM provider, model, and SDK. Phase 3 implements
the Language NLU service and requires a concrete decision. The service must extract a `DELAY`
intent (with `minutes` and `confidence`) from doctor Spanish messages, stay within the
scheduling-side 10 s AbortController window (ADR-0007), and be testable offline.

---

## Decision

Use **OpenRouter** as the LLM gateway, accessed via the **`openai` Python SDK** with
`base_url="https://openrouter.ai/api/v1"`. Default model: **`anthropic/claude-haiku-4.5`**,
configurable via the `LLM_MODEL` environment variable.

Structured output is obtained through **OpenAI-style tool/function calling** (`emit_intent`
tool with a flat schema: `kind`, `minutes`, `confidence`). The `openai` import is isolated to
`app/interpreter/openrouter.py`; no other module imports it.

Timeout: **8.0 s** (configured in `Settings.request_timeout`), strictly below the 10 s
scheduling AbortController timeout to ensure a clean 503 from the Language service before
the scheduling-side abort fires. Raised from 4.0 s after a live test observed a
ConnectTimeout→503 at exactly 4.0 s on cold-start (warm round-trip was 2.49 s).

---

## Options Considered

### A — OpenRouter + openai SDK (chosen)

- **Pros:** Single API key, model/provider flexibility without code changes; OpenAI-compatible
  interface works with the battle-tested `openai` SDK; Haiku 4.5 is fast and cheap for simple
  DELAY+minutes extraction.
- **Cons:** Two-hop privacy path (client → OpenRouter → underlying provider) — see tradeoff
  below.

### B — Anthropic direct (`anthropic` SDK)

- **Pros:** Single hop; stronger data-processing agreement with Anthropic.
- **Cons:** Locks the codebase to one provider; requires a different SDK and tool-calling
  syntax; switching later is more disruptive.

### C — OpenAI direct

- **Pros:** Single hop; canonical openai SDK.
- **Cons:** Locks to OpenAI models; cannot easily use Anthropic or other providers.

---

## Privacy Tradeoff (Two-Hop Path)

With OpenRouter the doctor's message travels **two hops**: the HealthSync Language service →
OpenRouter → the underlying model provider (e.g. Anthropic). This is an explicit, accepted
tradeoff for MVP:

- It enables model flexibility without code changes.
- For a production deployment with stricter data-residency requirements, migrate to Option B
  (Anthropic direct) by replacing only `app/interpreter/openrouter.py`; the hexagonal seam
  (ADR-0002) keeps all other code unchanged.

---

## Consequences

- `OPENROUTER_API_KEY` is required at runtime; unit/route tests use `FakeInterpreter` and
  run fully offline.
- The live integration test (`tests/test_openrouter_live.py`) self-skips when
  `OPENROUTER_API_KEY` is absent.
- Switching providers later requires only a new adapter in `app/interpreter/`; the port
  (`LLMInterpreter` Protocol), route, and tests are unaffected.
- `CANCEL_BLOCK` and the clarification path are deferred to Phase 5; only `DELAY` is
  implemented in Phase 3.
