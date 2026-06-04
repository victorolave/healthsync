# 10. Language understanding mechanism

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** victorolave

## Context and Problem Statement

The Language service (FastAPI, [ADR-0006](./0006-distributed-architecture.md)) must turn a doctor's **free-text message in Spanish** ([D2](../PRD.md)) into a **structured intent + parameters** — the behavior-free data contract from [ADR-0005](./0005-intent-extensibility.md).

The product's core promise is **genuine natural-language understanding**: the doctor writes the way they speak ("tuve una urgencia, llego 40 minutos tarde", "se me complicó", "cancelá la tarde"). How does the service interpret that?

## Decision Drivers

- Tolerate **real phrasing variety**, not a rigid format — this is the product's promise.
- Support the **clarification path** (Scenario 5): low confidence must lead to a question, never a guess — so the mechanism must express **confidence**.
- Produce the **structured intent** of the ADR-0005 contract.
- **Spanish** at launch (D2); multi-language is on the radar (§8).
- **Medical context**: the privacy of message content and safety (no wrong guesses).
- Teach the "intelligent" part of the product credibly.

## Considered Options

- **A. LLM with structured output** — a language model extracts the intent, parameters, and a confidence signal.
- **B. Rules / grammar** — keywords, patterns, and time parsing.
- **C. Hybrid** — rules for clear cases, LLM fallback for the rest.

## Decision Outcome

Chosen: **A. LLM with structured output.**

The Language service prompts an LLM to extract, from the Spanish message, a result conforming to the [ADR-0005](./0005-intent-extensibility.md) intent schema:

```
"tuve una urgencia, llego 40 minutos tarde"
        │  LLM, constrained to the intent schema
        ▼
{ intent: DELAY, minutes: 40, confidence: 0.94 }
```

- The output is **validated against the schema** before it leaves the service; anything off-contract is rejected.
- The **confidence** signal drives the clarification path (Scenario 5): below a threshold, the system asks rather than guesses.
- The LLM's job is **interpretation only** — it stays inside the `language/` context. The planners (behavior) remain in `scheduling/` ([ADR-0005](./0005-intent-extensibility.md)), so this reinforces the boundary rather than crossing it.
- The **specific provider/model** is a separate, smaller decision deferred to its own ADR.

**On the risks (honest):** sending the message to an external provider raises privacy, and an LLM is non-deterministic. Mitigations: the content is scheduling logistics rather than deep clinical data; the output is validated against the schema; and the doctor's confirmation gate (D1) is the ultimate safety net — no change is applied on the model's word alone.

### Consequences

- **Good**, because it delivers the product's core promise: robust understanding of how doctors actually write.
- **Good**, because a confidence signal maps cleanly onto the clarification path, and structured output maps onto the ADR-0005 contract.
- **Good**, because it is naturally multilingual, easing the §8 multi-language future.
- **Bad**, because it adds per-call cost and latency, a provider dependency, and non-determinism that must be contained by schema validation and the confirmation gate.
- **Bad/Neutral**, because message content leaves the system to a provider; provider choice and data handling must be decided deliberately (its own ADR).

## Pros and Cons of the Options

### A. LLM with structured output
- Good: robust to phrasing; expresses confidence; multilingual; fast to build.
- Bad: cost/latency; provider dependency; non-determinism; message privacy.

### B. Rules / grammar
- Good: deterministic; no provider; private; no per-call cost.
- Bad: brittle to phrasing variety; many manual rules — fights the natural-language promise.

### C. Hybrid
- Good: balances control, cost, and robustness.
- Bad: two paths to build and maintain.

## References

- [ADR-0005](./0005-intent-extensibility.md) — the structured intent schema the LLM must produce.
- [ADR-0006](./0006-distributed-architecture.md) — the Language service (FastAPI) that owns this.
- [PRD](../PRD.md) — §4.2 (intent taxonomy), §8 (multi-language future), D1 (confirm gate), D2 (Spanish), Scenario 5 (clarification).
- Pending: an ADR selecting the specific LLM provider/model and its data-handling terms.
