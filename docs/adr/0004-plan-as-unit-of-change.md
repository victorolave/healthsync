# 4. The Plan as the unit of change

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** victorolave

## Context and Problem Statement

Product decision D1 (propose-and-confirm) means **nothing in the agenda may change, and no patient may be notified, before the doctor confirms**. That forces a question in the core `scheduling/` context ([ADR-0003](./0003-bounded-contexts.md)): *how does the domain represent a change to the agenda?*

There must be something between "the intent was understood" and "the agenda was mutated" that can be **computed**, **shown to the doctor**, **confirmed**, and only then **applied** — or discarded with no effect.

## Decision Drivers

- Encode D1 **structurally**: no effect on the agenda or on patients before confirmation.
- The proposed change must be **inspectable** (to show the doctor) and **testable** (computed with no side effects).
- `notifications/` must know **exactly who and what changed** — this must be derivable from the change.
- Support D4: when a reshuffle overflows, the proposed resolution travels inside the same change and is confirmed together.
- Keep the agenda aggregate **clean** — there must be one unambiguous "current real agenda."
- Keep the domain **pure**, consistent with the hexagonal style (ADR-0002).

## Considered Options

- **A. An explicit `Plan`** — a proposed change-set, computed by a pure function, applied only on confirmation.
- **B. Direct mutation + undo/rollback** — change the agenda immediately but reversibly; confirm means keep vs. undo.
- **C. Draft state on the agenda aggregate** — hold proposed appointments alongside confirmed ones; confirming promotes the drafts.

## Decision Outcome

Chosen: **A. An explicit `Plan` as the unit of change.**

Rescheduling is a **pure function** of the current agenda and the interpreted intent:

```
plan = scheduling.computePlan(currentAgenda, intent)
```

- The `Plan` is an **immutable value object**. Computing it **mutates nothing**.
- It carries the **proposed change-set** — the ordered operations (move appointment A 3:00 → 3:40, cancel B, …) and any **flagged conflicts** (e.g., an appointment overflowing closing time, with its proposed resolution per D4).
- It is the artifact the `app/` layer shows the doctor at the **confirmation gate** (D1).
- `apply(plan)` is the **only operation that mutates** the agenda. On confirmation, `app/` applies the plan and hands its change-set to `notifications/` so exactly the affected patients are told. On rejection, **nothing changes**.

This makes propose-and-confirm a property of the model itself, not a convention someone must remember to honor.

### Consequences

- **Good**, because D1 is guaranteed by construction: effects are impossible until `apply`.
- **Good**, because the domain is a pure function `(agenda, intent) → Plan`, testable with no UI, no language provider, and no database — serving the educational success criterion.
- **Good**, because the Plan's change-set is the single source of truth for *who to notify*, keeping `notifications/` simple and correct.
- **Good**, because D4 fits naturally: an overflow becomes a flagged conflict with a proposed resolution inside the same Plan the doctor confirms.
- **Bad**, because it introduces an extra domain concept and requires deciding the change-set representation (operations vs. resulting snapshot).
- **Neutral**, because a Plan computed against a stale agenda must be revalidated at apply time; staleness handling is deferred to implementation.

## Pros and Cons of the Options

### A. An explicit `Plan`
- Good: models D1 directly; inspectable and testable; tells notifications who changed; D4 fits inside it.
- Bad: one more concept to model and maintain.

### B. Direct mutation + undo/rollback
- Good: simpler domain ("just change it"); reuses an event log.
- Bad: fights D1 — the agenda and possibly notifications change before confirmation; "apply then undo" is unsafe in a medical context.

### C. Draft state on the agenda aggregate
- Good: no separate object.
- Bad: mixes proposed and committed state in one aggregate, muddying its invariants and the meaning of "the current real agenda."

## References

- [ADR-0002](./0002-hexagonal-architecture.md) — pure domain, no side effects.
- [ADR-0003](./0003-bounded-contexts.md) — the Plan lives in the `scheduling/` core context; `app/` orchestrates confirm + apply; `notifications/` consumes the change-set.
- [PRD](../PRD.md) — D1 (propose-and-confirm), D4 (overflow resolution), §4.3–§4.6.
- Builds on this decision: [ADR-0005](./0005-intent-extensibility.md) — intent representation & extensibility.
