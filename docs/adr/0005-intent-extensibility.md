# 5. Intent representation and extensibility

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** victorolave

## Context and Problem Statement

The [PRD](../PRD.md) §8 requires the intent taxonomy to be **open for extension**: adding a new intent must not force edits to existing code. There are six today (`DELAY`, `EARLY`, `EXTEND`, `BLOCK_TIME`, `CANCEL_BLOCK`, `CANCEL_DAY`) and the set will grow.

There is also a boundary constraint from [ADR-0003](./0003-bounded-contexts.md): `language/` produces the intent as **data** (a kind plus parameters); `scheduling/` knows **how** that intent becomes a [Plan](./0004-plan-as-unit-of-change.md). Data and behavior live in different contexts and must not be coupled.

How do we represent intents and dispatch each one to its planning logic, satisfying both the open-for-extension requirement and the context boundary?

## Decision Drivers

- §8: adding an intent should be **adding a unit**, not editing existing code (Open/Closed Principle).
- Each intent's planning logic must be **isolated and independently testable**.
- Respect the [ADR-0003](./0003-bounded-contexts.md) boundary: intent **data** belongs to `language/`, planning **behavior** belongs to `scheduling/`.
- Do **not** over-engineer the two intents the MVP actually ships.
- Fit the hexagonal style: planners are domain services inside `scheduling/`.

## Considered Options

- **A. Strategy + registry** — one planner per intent kind, resolved through a registry.
- **B. Polymorphic intent** — each intent type computes its own plan.
- **C. Central switch** — one `computePlan` function that matches on `intent.kind`.

## Decision Outcome

Chosen: **A. Strategy + registry**, with a strict separation of data and behavior:

- An **intent is an immutable, behavior-free value**: `{ kind, params }`, owned by `language/`. It carries no scheduling logic.
- Planning is **one handler per kind** — `DelayPlanner`, `CancelBlockPlanner`, … — living in `scheduling/`, each implementing a common contract `(agenda, intent) → Plan` ([ADR-0004](./0004-plan-as-unit-of-change.md)).
- A **registry** maps `intent.kind → planner`. It is the single extension point.

```
language/    intent = { kind, params }        ← data only, no behavior
                   │
scheduling/  registry[kind] → Planner
   ├─ DelayPlanner        (agenda, intent) → Plan
   ├─ CancelBlockPlanner  (agenda, intent) → Plan
   └─ … register new planners here
```

Adding an intent means: a new parameter shape in `language/`, a new planner registered in `scheduling/`. **No existing code is edited** — open for extension, closed for modification.

### Consequences

- **Good**, because adding an intent touches only new files plus one registration line, satisfying §8 by construction.
- **Good**, because each planner is isolated and unit-testable against an agenda, with no UI or language provider.
- **Good**, because the boundary holds: `language/` stays free of scheduling logic, `scheduling/` stays free of natural language.
- **Bad**, because it adds a registry indirection that is more than two MVP intents strictly need.
- **Neutral**, because an unknown or unregistered `kind` must be handled explicitly (treated as not-yet-supported, surfaced to the doctor) rather than silently ignored.

## Pros and Cons of the Options

### A. Strategy + registry
- Good: textbook Open/Closed; each intent isolated and testable; the registry is the one extension point; respects the data/behavior boundary.
- Bad: registry indirection; some ceremony for a small set.

### B. Polymorphic intent
- Good: classic OO; adding an intent is a new subtype; no separate registry.
- Bad: puts agenda/scheduling behavior inside the intent, which belongs to `language/` — coupling the two bounded contexts and violating ADR-0003.

### C. Central switch
- Good: simplest and most direct for a small set; all logic in one place.
- Bad: adding an intent edits the central function; it grows without bound; violates Open/Closed and the §8 requirement.

## References

- [ADR-0003](./0003-bounded-contexts.md) — the `language/` ↔ `scheduling/` boundary this preserves.
- [ADR-0004](./0004-plan-as-unit-of-change.md) — planners produce a `Plan`.
- [PRD](../PRD.md) — §4.2 (intent taxonomy), §8 (intents open for extension).
