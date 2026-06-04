# 3. Bounded contexts and module organization

- **Status:** Superseded by [ADR-0006](./0006-distributed-architecture.md) — the *modular monolith* topology is replaced by a distributed multi-service architecture. The **bounded contexts defined here are retained** and now map onto services.
- **Date:** 2026-05-27
- **Deciders:** victorolave

## Context and Problem Statement

[ADR-0002](./0002-hexagonal-architecture.md) chose hexagonal architecture but explicitly left open *what the contexts are, how they relate, and how the code is organized on disk*. The [PRD](../PRD.md) turns several of these into hard requirements:

- "Language understanding **separable** from the scheduling logic" (§8) — a context boundary.
- Success criterion: "each capability is **independently understandable**" — favors clear module boundaries.
- The repository should **communicate the domain**, valuable for the workshop audience.

At the same time, this is a single-doctor MVP that must stay simple to build and deploy. How do we draw the module boundaries without either under-structuring (everything tangled) or over-structuring (distributed-systems ceremony for one doctor)?

## Decision Drivers

- Honor the language ↔ scheduling separability the PRD requires.
- Keep each context understandable and testable in isolation.
- Make the repository "scream" the domain rather than the technology.
- Keep deployment simple: a monolith, not a distributed system.
- Do not over-modularize a single-doctor MVP.
- Each context must fit the hexagonal style already chosen (ADR-0002).

## Considered Options

- **A. Single core domain + adapters** — one hexagon; scheduling is the domain, everything else (language, notification, chat, persistence) is an adapter.
- **B. Modular monolith with bounded contexts** — `language`, `scheduling`, `notifications` as distinct modules with clear boundaries, plus an application layer; domain-first (screaming) organization.
- **C. Layer-first organization** — `controllers / services / models / repositories`.

## Decision Outcome

Chosen: **B. Modular monolith with bounded contexts**, organized domain-first (screaming).

The system is **one deployable monolith** composed of three bounded contexts plus an application layer:

- **`scheduling/`** — the **core** context: agenda, appointment, the *plan*, and the recalculation / reorganization rules. The hard, valuable logic.
- **`language/`** — turns a doctor's free-text (Spanish, per D2) message into a **structured intent + parameters**. Owns the interpretation contract; the actual understanding technology lives behind a port as an adapter.
- **`notifications/`** — turns applied or proposed changes into **patient-facing messages** and tracks their delivery.
- **`app/`** — the **application layer** that orchestrates the flow: intake → interpret → build plan → confirm → notify, including the clarification loop (Scenario 5) and the confirmation gate (D1). The conversational flow is **orchestration, not a context**.

```
src/
├─ scheduling/      CORE context — agenda, plan, rules
├─ language/        context — message → structured intent
├─ notifications/   context — changes → patient messages
└─ app/            application layer — orchestrates the flow
                    (intake, clarification loop, confirm gate)

Each context is internally hexagonal: domain at the center,
ports for what it needs or exposes, adapters for technology.
The in-app chat (D3) is a driving adapter that calls app use cases.
```

Contexts communicate only through **explicit contracts** (application services or published events); no context reaches into another's internals.

### Consequences

- **Good**, because the language ↔ scheduling separability the PRD requires is structural, not aspirational.
- **Good**, because each context is independently understandable and testable — directly serving the educational success criterion.
- **Good**, because the top-level layout communicates the domain at a glance, and new capabilities (more channels, multi-language, multi-doctor) extend a context instead of rewriting the core.
- **Bad**, because it adds upfront structure and requires maintaining the contracts between contexts.
- **Neutral**, because the boundaries are conventions enforced by discipline and review, not by deployment — it is a monolith, not microservices.

## Pros and Cons of the Options

### A. Single core domain + adapters
- Good: simplest; least ceremony for a single-doctor MVP.
- Bad: treating "language understanding" as a mere adapter undersells a concern that has its own model; harder to evolve toward multi-language; teaches little about bounded contexts.

### B. Modular monolith with bounded contexts
- Good: honors the PRD separability requirement; each context isolated; extensible; still a single deployable.
- Bad: more upfront structure; inter-context contracts to define and maintain.

### C. Layer-first organization
- Good: familiar to most developers.
- Bad: contradicts hexagonal and the PRD; the repository communicates technology, not the domain.

## References

- [ADR-0002](./0002-hexagonal-architecture.md) — hexagonal architecture (this decision applies it per context).
- [PRD](../PRD.md) — §8 (language/scheduling separability), §9 success criteria, D1 (confirm gate), D2 (Spanish), D3 (in-app channel).
- Robert C. Martin, *Screaming Architecture*.
- Builds on this decision: [ADR-0004](./0004-plan-as-unit-of-change.md) — the core domain model (the *plan* as the unit of change).
