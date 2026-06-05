# HealthSync — Build Plan

|             |                                                      |
| ----------- | ---------------------------------------------------- |
| **Status**  | Active                                               |
| **Purpose** | The order in which HealthSync is built, and why      |
| **Owner**   | victorolave                                          |

> The [PRD](./PRD.md) defines *what* HealthSync is; the [ADRs](./adr/) define
> *why* it is built the way it is. This document defines the **order** in which
> those decisions become code — and the criteria that produce that order.
> **Order is a design decision**: a sound architecture built in the wrong
> sequence fails the same way a house does when the walls go up before the
> foundation.

---

## Traceability

Each layer of the project feeds the next:

```
PRD scenarios (§6)  ──become──▶  acceptance tests
ADR decisions       ──become──▶  the shape of each module
this plan           ──become──▶  the sequence of vertical slices
                                  ▼
                                 code
```

The PRD's §6 states its scenarios *"become acceptance criteria later."* This plan
is the *later*: when the domain is built, those scenarios are its tests.

---

## Guiding principles

Three principles produce the sequence below. Every phase follows from them.

### 1. Walking skeleton first

*(Alistair Cockburn)* — In a **distributed** system the primary risk is not the
domain logic; it is the **integration between services**
([ADR-0006](./adr/0006-distributed-architecture.md),
[ADR-0007](./adr/0007-inter-service-communication.md)). The first thing built is a
thin, end-to-end slice crossing all three apps while doing almost nothing — so the
contracts are proven before any real logic is written.

### 2. Inside-out within each service

*(Hexagonal — [ADR-0002](./adr/0002-hexagonal-architecture.md))* — Within the
scheduling service, build from the center out: the **pure domain first** (no
NestJS, no Postgres, no LLM), then the **ports**, then the **adapters**. The core
depends on nothing. This is the difference between *claiming* hexagonal and
*doing* it.

### 3. Vertical slices, not horizontal layers

No "first the whole database, then the whole API, then the whole UI." Each step
delivers **one PRD scenario working end to end**. Horizontal layering produces a
system where nothing works until everything is done.

---

## Phases

Starting point: the monorepo is scaffolded and the three apps under `apps/` each
start and answer a health check. From here:

| #     | Phase                       | Backing                  | Delivers                                                       |
| ----- | --------------------------- | ------------------------ | ------------------------------------------------------------- |
| **0** | Walking skeleton            | ADR-0006, 0007, 0011     | The empty end-to-end pipeline; proven inter-service contracts  |
| **1** | The scheduling domain       | ADR-0002, 0004, 0005     | The pure core: Agenda, the Plan, `recalculate`, first planner  |
| **2** | Ports & adapters            | ADR-0002, 0007, 0011     | Persistence (Postgres), inbound HTTP, the language client      |
| **3** | Language service (NLU)      | ADR-0010, 0005           | Real interpretation: message → intent + params + confidence    |
| **4** | Close the loop              | ADR-0004, 0012, 0013, D1 | Propose-and-confirm, apply-on-confirm, notifications over SSE   |
| **5** | Second intent + ambiguity   | ADR-0005, scenarios 2 & 5| `CANCEL_BLOCK`, the clarification path                         |

### Phase 0 — Walking skeleton

**Build:** the empty pipeline, end to end. The web app sends a message → NestJS
receives it over REST → NestJS calls FastAPI's `/interpret`, which returns a
**hard-coded** intent → NestJS returns it → the web app renders it. Wire NestJS to
Postgres with a trivial query so the persistence path is exercised too.

**Why first:** it validates every contract in the system
([ADR-0007](./adr/0007-inter-service-communication.md)) before any time is spent on
real logic. If the services cannot talk, that must surface in Phase 0, not Phase 4.

**Implementation note:** make the hard-coded intent a `DELAY`. The skeleton carries
a placeholder DELAY and every later phase fleshes out that *same* DELAY until it
works for real — no throwaway code, one continuous build.

### Phase 1 — The scheduling domain

The core of the system. Inside `apps/scheduling`, build the domain with **no
frameworks**:

- Value objects: `Appointment`, `Agenda`, `TimeSlot`, working hours.
- The **Plan** as an immutable value object
  ([ADR-0004](./adr/0004-plan-as-unit-of-change.md)): an ordered change-set of
  operations plus the conflicts it flags.
- The pure function `recalculate(currentAgenda, intent) → Plan`.
- The first planner, `DelayPlanner`, dispatched through the strategy registry
  ([ADR-0005](./adr/0005-intent-extensibility.md)).

**Build it test-first.** The domain is pure logic with zero I/O — the ideal place
for tests, and the PRD's Scenario 1 (running late) *is* the test.

**Why here:** the core is the most valuable and most stable part of the system.
Building it first, in isolation, proves the hexagonal claim: the domain compiles
and is fully tested without knowing NestJS, Postgres, or any LLM exists.

### Phase 2 — Ports & adapters

Connect the pure core to the outside world:

- The **persistence port** + a **Postgres adapter**
  ([ADR-0002](./adr/0002-hexagonal-architecture.md),
  [ADR-0011](./adr/0011-persistence.md)): the agenda, appointments, and the change
  history ([§4.7](./PRD.md)). Enforce **no double-booking with database
  constraints**, not only in application code.
- The **inbound HTTP adapter** (NestJS controllers) that orchestrates: receive a
  message → call language → recalculate → return the proposed Plan.
- The **language port** (a client toward FastAPI) + its REST adapter.

**Why now:** the domain already works and is tested; adapters are the plumbing that
lets the real world reach it. Build them around a known-good core, not before it.

### Phase 3 — Language service (NLU)

Build `apps/language` for real
([ADR-0010](./adr/0010-nlu-mechanism.md)): the `/interpret` endpoint takes the
doctor's **Spanish** message → an LLM with **structured output** → an intent +
parameters + a **confidence** score, validated against the
[ADR-0005](./adr/0005-intent-extensibility.md) schema before it leaves the service.
Start with DELAY.

**Why after the domain:** the Language service is a *supplier* of intents. Build the
consumer (the domain that acts on intents) first, so that by the time real intents
are produced there is already something meaningful to do with them.

**Boundary:** Language *only interprets*; it never plans. That is
[ADR-0010](./adr/0010-nlu-mechanism.md) and
[ADR-0005](./adr/0005-intent-extensibility.md) working together, and it is why the
service is stateless.

### Phase 4 — Close the loop (confirm + notify)

Wire the full human-in-the-loop flow:

- **Propose-and-confirm** ([D1](./PRD.md),
  [ADR-0004](./adr/0004-plan-as-unit-of-change.md)): the Plan is *proposed*; the
  doctor confirms; only then is it applied (apply-on-confirm).
- On apply: persist the changes and create **notifications** as lifecycle entities
  ([ADR-0013](./adr/0013-notification-lifecycle.md)).
- Push updates in real time over **SSE**
  ([ADR-0012](./adr/0012-realtime-transport.md)): `plan-ready` and notifications.
- Frontend: the chat input, the proposed plan, a confirm action, the notifications
  view.

**Why now:** confirmation and notification only make sense once there is a real
Plan to confirm and real changes to announce. This phase closes the end-to-end
flow the PRD describes (§5).

### Phase 5 — Second intent + ambiguity

- Add `CancelBlockPlanner` (Scenario 2). Adding an intent is **a new planner and
  nothing else** — no existing code is touched. This realizes
  [ADR-0005](./adr/0005-intent-extensibility.md)'s Open/Closed promise.
- Add the **clarification path** (Scenario 5): when confidence is low, the system
  asks one question instead of guessing.

**Why last of the must-haves:** it demonstrates that the architecture *holds* —
extending the system is cheap and safe.

**After Phase 5 the Must-have set is complete:** `DELAY` and `CANCEL_BLOCK`, with
confirmation, notification, and clarification, working end to end.

---

## Design decisions worth noting

- **Walking skeleton before the rich domain.** A common alternative is "domain
  first — it is the valuable, testable part." It is a real trade-off. For a
  *distributed* system the skeleton wins: it validates the inter-service contracts
  early, when changing them is still cheap.
- **One DELAY, carried through.** The skeleton transports a placeholder DELAY; each
  phase fleshes out that same DELAY. No code is thrown away.
- **The frontend is not a phase.** It grows with every slice — minimal in Phase 0,
  complete in Phase 4. Building it as its own block would be the horizontal
  layering this plan avoids.

---

## Optional feature (stretch)

**`EXTEND` — Scenario 6: *"the 2pm will run 30 minutes longer."***

A **Should-have** ([PRD §7](./PRD.md)) deliberately kept out of the core build. It
is a low-cost, self-contained addition for when there is capacity beyond the
must-haves:

- **A single new layer** — an `ExtendPlanner`. The rest of the pipeline
  (interpret, confirm, notify, SSE, persistence) already exists from earlier
  phases.
- **A direct test of extensibility.** Adding it exercises
  [ADR-0005](./adr/0005-intent-extensibility.md)'s Open/Closed principle: a new
  intent is added by writing **only a planner** and registering it, touching
  nothing else.
- **A clean contrast with DELAY.** DELAY shifts the *whole* day forward; EXTEND
  moves only the appointments *after* the extended one.

**Alternative:** `BLOCK_TIME` (Scenario 3, "I need 30 minutes free at 3pm") — the
same "just a new planner" mechanic. `CANCEL_DAY` (Could-have) is trivial by
comparison.

---

## Coverage check (MoSCoW)

This order satisfies every **Must-have** from [PRD §7](./PRD.md) before any
Should-have:

| Must-have                        | Delivered in       |
| -------------------------------- | ------------------ |
| In-app chat intake               | Phase 0 → 4        |
| Spanish understanding            | Phase 3            |
| `DELAY` + `CANCEL_BLOCK`         | Phase 1/3 → 5      |
| Agenda recalculation             | Phase 1            |
| Reorganization (shift, cancel)   | Phase 1 → 5        |
| Propose-and-confirm (D1)         | Phase 4            |
| Real-time in-app notification    | Phase 4            |
| Clarification path               | Phase 5            |
| Basic change history             | Phase 2 → 4        |

Should-haves (`EXTEND`, `BLOCK_TIME`, patient accept/decline) and Could-haves stay
out of the core build — exactly where the MoSCoW classification placed them.

---

## References

- [PRD](./PRD.md) — §5 (product flow), §6 (scenarios → acceptance tests), §7 (MoSCoW).
- [ADRs](./adr/) — the decisions each phase realizes.
