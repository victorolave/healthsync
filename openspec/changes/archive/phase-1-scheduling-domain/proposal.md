# Proposal — Phase 1: The Scheduling Domain

Build the pure scheduling core of HealthSync — `Agenda`, the immutable `Plan`, the
pure function `recalculate(agenda, intent) → Plan`, and the first `DelayPlanner`
dispatched through a strategy registry — with **zero frameworks** and **test-first**.
This is the most valuable, most stable part of the system, and building it in
isolation is what proves the hexagonal claim of [ADR-0002](../../../docs/adr/0002-hexagonal-architecture.md):
the domain compiles and is fully tested without knowing NestJS, Postgres, or any LLM exists.

---

## Intent

| Question | Answer |
|----------|--------|
| **What problem** | The scheduling service has a working NestJS skeleton but **no domain**. There is nothing that turns a doctor's intent into a proposed change to the agenda. |
| **Why now** | Phase 0 proved the inter-service contracts. The next-highest risk is the **domain logic itself** — and per BUILD-PLAN principle 2 (inside-out), the pure core must exist before any port or adapter can connect to it. |
| **What success looks like** | `recalculate(agenda, { kind: "DELAY", params: { minutes: 40 } })` returns an immutable `Plan` whose operations shift the day forward by 40 minutes and whose conflicts flag any appointment pushed past closing time — verified by a unit test that imports **nothing from `@nestjs/*`, Postgres, or any HTTP client**. |

The acceptance anchor is **PRD Scenario 1 (Running Late)**. When this proposal's
work is done, that scenario is a green test.

---

## Scope

### In scope

- Value objects in `apps/scheduling/src/domain/`:
  - `LocalTime` — wall-clock time value object (see Decision 3).
  - `TimeSlot` — a start `LocalTime` + duration in minutes.
  - `Appointment` — id + `TimeSlot` + `patientId` (see Decision 6).
  - `WorkingHours` — open/close `LocalTime` boundaries.
  - `Agenda` — immutable ordered collection of `Appointment`s for one day, plus its `WorkingHours`.
  - `Intent` — the behavior-free `{ kind, params }` value type the domain *receives*.
  - `Plan` — immutable: ordered `operations` + flagged `conflicts` (see Decision 1).
- The `Planner` contract and the first implementation, `DelayPlanner`.
- The planner **registry** (see Decision 2).
- The pure entry point `recalculate(registry, agenda, intent) → Plan`.
- Test-first construction (strict TDD; runner is Jest via `cd apps/scheduling && pnpm test`).

### Out of scope (explicit)

| Deferred item | Where it belongs |
|---------------|------------------|
| `apply(plan)` — the only mutating operation | **Phase 4** (apply-on-confirm) |
| NestJS wiring / controllers / DI modules | **Phase 2** (inbound HTTP adapter) |
| Persistence (Postgres adapter, change history) | **Phase 2** |
| The language client / FastAPI call | **Phase 2 / 3** |
| Touching `src/messages/*` | Untouched this phase; integration is Phase 2 |
| Conflict **resolution** proposals (move-to-next-day / cancel) | **Phase 4** (D4) — Phase 1 flags only (Decision 5) |
| A second planner (`CancelBlockPlanner`) | **Phase 5** |

---

## The seven decisions

### Decision 1 — Plan representation: **operations list + conflicts** (A1)

`Plan = { operations: PlanOperation[], conflicts: Conflict[] }` where a
`PlanOperation` is `{ type: 'move', appointmentId, from: TimeSlot, to: TimeSlot }`.

**Why.** [ADR-0004](../../../docs/adr/0004-plan-as-unit-of-change.md) prescribes
the Plan **literally** as "the ordered operations ... and any flagged conflicts."
The change-set is the single source of truth for *who to notify and from where to
where* — which `notifications/` needs in Phase 4. The before/after **snapshot**
(A2) is easier to render but contradicts the ADR's wording and carries no operation
identity. The hybrid (A3) is premature for Phase 1. The proposed-agenda *view* can
be **derived** from operations when Phase 4 needs it.

### Decision 2 — Registry pattern: **registry injected into `recalculate`** (B3)

```ts
export function buildPlannerRegistry(): Map<string, Planner> {
  return new Map([['DELAY', new DelayPlanner()]]);
}
export function recalculate(registry: Map<string, Planner>, agenda: Agenda, intent: Intent): Plan;
```

**Why.** [ADR-0002](../../../docs/adr/0002-hexagonal-architecture.md) makes
dependency injection the structural backbone: the **composition root** owns *what
is registered*, the domain owns *how dispatch works*. Injecting the registry keeps
`recalculate` a pure function of its arguments (no hidden module-scoped singleton),
which makes tests trivial — a test injects a one-entry registry and asserts.
The decorator/auto-registration option (B2) is rejected outright: it drags
`reflect-metadata` into the domain and breaks "the domain depends on nothing."
B3 over B1 (plain module Map) because B3 is the more honest hexagonal teaching
artifact for a workshop codebase and removes the module-singleton from the pure
path. An unregistered `kind` throws `UnsupportedIntentError` — handled explicitly,
never silently ignored ([ADR-0005](../../../docs/adr/0005-intent-extensibility.md)).

### Decision 3 — Time representation: **`LocalTime` value object** (C3)

`LocalTime { readonly hours; readonly minutes }` with `plusMinutes(n)`,
`isAfter(other)`, `compareTo(other)`, and `toString() → "HH:MM"`.

**Why.** Minutes-since-midnight (C1) works arithmetically but lets a raw `number`
leak everywhere with no type safety — easy to confuse "duration" with "time of
day." `HH:MM` strings (C2) need parsing on every operation. JavaScript `Date` (C4)
is **rejected**: it drags timezone/UTC complexity into a single-timezone domain.
`LocalTime` is type-safe, immutable, arithmetic is explicit, and it reads cleanly
in tests — the pedagogically sound choice for a domain that teaches value objects.
Internally it may store minutes-since-midnight, but that is an encapsulated detail.

### Decision 4 — DELAY semantics: **uniform shift of every appointment by `params.minutes`** (no Clock)

`DelayPlanner` shifts **every appointment in the agenda** forward by exactly
`params.minutes`. It does **not** read a clock and does **not** filter by "now."

**Why.** A time-filtered "from now" variant would require injecting a `Clock` into
the domain, which breaks purity and testability — a pure function cannot call
`Date.now()`. The PRD Scenario 1 expected result ("shift all of today's remaining
appointments forward by ~40 min") is satisfied by a uniform shift, because the
`Agenda` handed to `recalculate` already *is* the remaining day (the application
layer is responsible for selecting "today's remaining" before calling the domain —
Phase 2). The loose `params.from: "now"` field is **ignored** by the Phase 1
planner; honoring it is a Phase 4 concern once a `Clock` port exists. This keeps
`recalculate` a true pure function `(registry, agenda, intent) → Plan`.

### Decision 5 — Conflict depth: **flag-only** (defer resolution to Phase 4)

A `Conflict` flags an appointment whose new end time exceeds `WorkingHours.close`:
`{ appointmentId, reason: 'OVERFLOWS_CLOSING', proposedSlot: TimeSlot }`. Phase 1
populates the flag and the offending slot **but proposes no resolution** (no
move-to-next-day, no cancel).

**Why.** BUILD-PLAN Phase 1 scope says only "flag any appointment pushed past
closing time for review." [ADR-0004](../../../docs/adr/0004-plan-as-unit-of-change.md)
*does* foresee a "proposed resolution per D4" inside the Plan — but it ties that to
D4, which BUILD-PLAN sequences into **Phase 4 (close the loop)**. Adding resolution
logic now would import Phase 4 product behavior into the foundational domain and
exceed scope. The `Conflict` shape leaves room (a future `resolution` field) so
Phase 4 extends without a rewrite — open for extension, consistent with the ADR.

### Decision 6 — Appointment shape: **include `patientId` now**

`Appointment { readonly id; readonly patientId; readonly slot: TimeSlot }`.

**Why.** The exploration flagged this as optional for Phase 1 tests — but a
`PlanOperation` exists to tell `notifications/` *who* changed
([ADR-0004](../../../docs/adr/0004-plan-as-unit-of-change.md)), and that *who* is
the patient. Modeling `patientId` now costs one field and zero logic, keeps the
value object honest to its purpose, and avoids a breaking shape change in Phase 4
when notifications arrive. `id` and `patientId` are plain `string`s in Phase 1
(e.g. `"appt-1"`, `"patient-1"`) — no UUID generator is needed for a pure domain;
identity generation is an infrastructure concern (Phase 2).

### Decision 7 — On-disk structure: flat, intent-revealing `src/domain/`

```
apps/scheduling/src/domain/
├── time/
│   ├── local-time.ts
│   └── local-time.spec.ts
├── agenda/
│   ├── time-slot.ts
│   ├── appointment.ts
│   ├── working-hours.ts
│   ├── agenda.ts
│   └── *.spec.ts
├── plan/
│   ├── plan.ts                 — Plan, PlanOperation, Conflict value objects
│   └── plan.spec.ts
├── intent/
│   └── intent.ts               — { kind, params } value type + UnsupportedIntentError
├── planning/
│   ├── planner.ts              — Planner contract
│   ├── delay-planner.ts
│   ├── delay-planner.spec.ts
│   ├── planner-registry.ts     — buildPlannerRegistry()
│   └── recalculate.ts          — recalculate(registry, agenda, intent)
└── index.ts                    — public domain surface (barrel)
```

**Why.** The folders are **screaming** — `agenda/`, `plan/`, `planning/` name the
domain concepts, not technical layers, communicating intent at a glance (ADR-0002's
"structure documents the architecture"). `intent/` lives in the domain only as a
*received* value type; its production stays on the `language/` side (ADR-0005
boundary). Imports use **extensionless relative paths**, matching the existing
`src/messages/*` convention (verified: ts-jest resolves them despite `nodenext`).

---

## Acceptance anchor — PRD Scenario 1 (DELAY 40 min)

```
Given  Agenda appointments [14:00–14:30, 14:30–15:00, 15:00–15:30, 15:30–16:00]
       WorkingHours 09:00–17:00
       Intent { kind: "DELAY", params: { minutes: 40 } }
When   recalculate(registry, agenda, intent)
Then   Plan.operations = [
         move(appt@14:00 → 14:40),
         move(appt@14:30 → 15:10),
         move(appt@15:00 → 15:40),
         move(appt@15:30 → 16:10),
       ]
       Plan.conflicts = []        (last appointment ends 16:40 < 17:00)
And    the original Agenda is unchanged (immutability)
And    the test imports nothing from @nestjs/*, no DB, no HTTP
```

Companion conflict test: add an appointment at `16:00–16:30`; after a 40-min shift
it lands at `16:40–17:10`, which overflows `17:00` → it appears in `Plan.conflicts`
with `reason: 'OVERFLOWS_CLOSING'`.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **NestJS leak into the domain** — a dev imports `@nestjs/*` into a domain spec, breaking the isolation claim | Convention is stated explicitly; verification asserts zero framework imports. A lint boundary rule is a candidate follow-up (not Phase 1 scope). |
| **`nodenext` module resolution** demands `.js` extensions in some setups | Verified that existing `src/messages/*` uses extensionless relative imports and ts-jest resolves them — domain follows the same convention. |
| **`params` is `Record<string, unknown>`** (loose by ADR-0005) — `DelayPlanner` must safely extract `minutes` | Validate inside `DelayPlanner` (reject non-positive / non-numeric `minutes` explicitly); param validation is the planner's responsibility, dispatch stays type-agnostic. |
| **Scope creep into `apply` / NestJS** | Out-of-scope table is explicit; verification rejects any `apply()` or framework wiring. |
| **`from: "now"` ambiguity** | Resolved by Decision 4 — ignored in Phase 1; honoring it needs a Clock port (Phase 4). |

---

## Phase boundaries (forward references)

- **Phase 2** consumes this domain: the inbound HTTP adapter calls `recalculate`,
  the persistence adapter loads/stores the `Agenda`, the language port supplies the
  `Intent`. Nothing in `src/messages/*` changes in Phase 1.
- **Phase 4** adds `apply(plan)`, propose-and-confirm (D1), conflict **resolution**
  (D4), and notifications derived from `Plan.operations`.
- **Phase 5** adds `CancelBlockPlanner` by writing **one planner + one registration
  line** — touching no existing code, proving ADR-0005's Open/Closed promise. The
  `buildPlannerRegistry()` factory (Decision 2) is the single extension point that
  makes this true.
