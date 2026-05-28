# 6. Distributed multi-service architecture (FastAPI + NestJS + frontend)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** victorolave
- **Supersedes:** [ADR-0003](./0003-bounded-contexts.md) (its monolith topology only)

## Context and Problem Statement

The primary objective of the HealthSync workshop is to **build and integrate two services in different technologies — FastAPI (Python) and NestJS (Node/TypeScript) — plus a single frontend**, and to teach how they communicate.

This directly conflicts with [ADR-0003](./0003-bounded-contexts.md), which chose a **modular monolith** (a single deployable). The conflict is real and is resolved here through the supersede mechanism established in [ADR-0001](./0001-record-architecture-decisions.md): ADR-0003 is not deleted; its monolith topology is replaced, while the **bounded contexts it defined are retained** — they now map onto deployable services.

How do we decompose HealthSync across the two required services and a frontend?

## Decision Drivers

- The workshop's core teaching goal: two **real, polyglot** services plus a frontend, integrated over the network.
- Play to each stack's strengths: **Python** for language understanding (NLP/AI ecosystem); **Node/TypeScript** for domain orchestration and real-time.
- Retain the bounded contexts from [ADR-0003](./0003-bounded-contexts.md) as service boundaries.
- Both services must carry **substantial responsibility** — avoid one fat service and one anemic one.
- Preserve the prior decisions: hexagonal per service ([ADR-0002](./0002-hexagonal-architecture.md)), the Plan ([ADR-0004](./0004-plan-as-unit-of-change.md)), and the intent data/behavior split ([ADR-0005](./0005-intent-extensibility.md)).

## Considered Options

- **A. FastAPI = language; NestJS = scheduling + notifications + orchestration; frontend → NestJS.**
- **B. FastAPI = language + scheduling (the "brain"); NestJS = BFF + notifications + real-time.**
- **C. Keep the modular monolith** (status quo, ADR-0003).

## Decision Outcome

Chosen: **A.** Three deployables:

- **Language service — FastAPI (Python).** Owns the `language/` context: turns a doctor's Spanish message ([D2](../PRD.md)) into a **structured intent + parameters**. Python for the NLP/AI ecosystem.
- **Scheduling service — NestJS (Node/TypeScript).** Owns `scheduling/` + `notifications/` + the `app/` orchestration: the agenda, the **Plan**, the confirmation gate ([D1](../PRD.md)), applying changes, notifying patients, and pushing real-time updates.
- **Frontend — a single app.** The doctor's chat and the patient view. Its backend is the Scheduling (NestJS) service.

```
[ Frontend (single app) ]   doctor chat + patient view
        │  REST + real-time
        ▼
[ NestJS ]  scheduling + notifications + orchestration
   agenda · Plan · confirm · notify
        │  "interpret this message"
        ▼
[ FastAPI ]  language understanding
   Spanish message → structured intent
```

Each service stays **internally hexagonal** (ADR-0002). The `scheduling/` ↔ `language/` boundary from ADR-0003 becomes a **network boundary**: the intent (data) crosses it; the planners (behavior) stay in the scheduling service ([ADR-0005](./0005-intent-extensibility.md)) — the data/behavior split is reinforced, not broken.

The **mechanics** of communication (synchronous vs. asynchronous, protocol, the frontend's entry point) are decided in **ADR-0007**.

### Consequences

- **Good**, because it meets the workshop's core objective: two genuine polyglot services plus a frontend, integrated over the network.
- **Good**, because each stack is used for its strength, and both services carry meaningful responsibility.
- **Good**, because the prior decisions carry over: hexagonal, the Plan, and the intent split all survive, and the context boundaries map cleanly onto services.
- **Bad**, because distribution adds real complexity — network calls, partial failure, multiple runtimes to deploy and run, cross-service contracts — heavier than a monolith for a single-doctor MVP. *(This complexity is, deliberately, part of what the workshop teaches.)*
- **Neutral**, because the language ↔ scheduling call is now a network hop with latency and failure modes that must be designed for (ADR-0007).

## Pros and Cons of the Options

### A. FastAPI = language; NestJS = scheduling + notifications + orchestration
- Good: both services substantial; Python used for AI, Node for domain/real-time; contexts map to services.
- Bad: two backends plus a frontend to run and deploy.

### B. FastAPI = language + scheduling; NestJS = BFF + notifications
- Good: concentrates all domain logic in one language (Python).
- Bad: NestJS becomes a thin BFF — weak as a teaching example of two real services; the rich domain (the Plan, scheduling rules) leaves TypeScript with little to own.

### C. Keep the modular monolith
- Good: simplest; no network boundary.
- Bad: does not meet the workshop's explicit two-service objective. Rejected.

## References

- [ADR-0001](./0001-record-architecture-decisions.md) — the supersede mechanism applied here.
- [ADR-0002](./0002-hexagonal-architecture.md) — each service is internally hexagonal.
- [ADR-0003](./0003-bounded-contexts.md) — **superseded** (topology); its bounded contexts are retained as services.
- [ADR-0004](./0004-plan-as-unit-of-change.md), [ADR-0005](./0005-intent-extensibility.md) — preserved across the split.
- [PRD](../PRD.md) — D1, D2, D3.
- Builds on this decision: ADR-0007 — inter-service communication *(pending)*.
