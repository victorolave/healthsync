# Scheduling Domain Specification

## Purpose

Define what must be true after Phase 1 is applied: a pure, framework-free scheduling
domain inside `apps/scheduling/src/domain/` that can turn an `Agenda` + an `Intent`
into an immutable `Plan` of ordered operations and flagged conflicts.

No NestJS, no Postgres, no HTTP, no clock reads. The domain is verified entirely by
unit tests that import nothing from `@nestjs/*`, driver adapters, or external
infrastructure.

Acceptance anchor: PRD Scenario 1 — "I had an emergency, I'll be 40 minutes late"
maps to `intent = { kind: 'DELAY', params: { minutes: 40 } }`, and the domain must
produce the exact operations and conflicts described in §6 of the PRD.

---

## On-disk structure

```
apps/scheduling/src/domain/
  time/
    local-time.ts          # LocalTime value object
  agenda/
    time-slot.ts           # TimeSlot value object
    appointment.ts         # Appointment value object
    working-hours.ts       # WorkingHours value object
    agenda.ts              # Agenda value object
  plan/
    plan.ts                # Plan, PlanOperation, Conflict types
  intent/
    intent.ts              # Intent value type + UnsupportedIntentError
  planning/
    planner.ts             # Planner interface contract
    delay-planner.ts       # DelayPlanner implementation
    planner-registry.ts    # buildPlannerRegistry factory
    recalculate.ts         # recalculate pure function
  index.ts                 # barrel export
```

All imports within `src/domain/` MUST be extensionless relative paths (matching the
existing `src/messages/*` convention; ts-jest resolves them despite
`moduleResolution: nodenext`).

---

## Requirements

### Requirement: LocalTime value object

`LocalTime` MUST be an immutable value object representing a wall-clock time
within a single day.

- Construction: `LocalTime.of(hours, minutes)` accepts integer `hours` in [0, 23]
  and integer `minutes` in [0, 59]. Any value outside those bounds MUST throw an
  `Error` with a descriptive message.
- Equality: two `LocalTime` instances with the same hours and minutes MUST be
  considered equal.
- Immutability: no property on a `LocalTime` instance is settable after construction.
- `plusMinutes(n: number): LocalTime` — returns a NEW `LocalTime` shifted by `n`
  minutes. `n` MUST be a non-negative integer; negative values MUST throw.
- Overflow past midnight: if the resulting minutes-since-midnight exceed 23:59
  (i.e., 1439 minutes from 00:00), `plusMinutes` MUST throw an `Error` rather than
  wrap or truncate silently.
- `isAfter(other: LocalTime): boolean` — returns `true` when `this` is strictly
  later than `other`.
- `toString(): string` — returns `'HH:MM'` with zero-padding (e.g., `'09:05'`).

#### Scenario: valid construction

- GIVEN `hours = 9` and `minutes = 5`
- WHEN `LocalTime.of(9, 5)` is called
- THEN the instance is created successfully
- AND `toString()` returns `'09:05'`

#### Scenario: hours out of bounds rejects construction

- GIVEN `hours = 24`
- WHEN `LocalTime.of(24, 0)` is called
- THEN an `Error` is thrown

#### Scenario: minutes out of bounds rejects construction

- GIVEN `minutes = 60`
- WHEN `LocalTime.of(9, 60)` is called
- THEN an `Error` is thrown

#### Scenario: plusMinutes returns a new instance

- GIVEN `t = LocalTime.of(14, 0)`
- WHEN `t.plusMinutes(40)` is called
- THEN the result is a new `LocalTime` equal to `14:40`
- AND `t` is unchanged (still `14:00`)

#### Scenario: plusMinutes overflows past midnight throws

- GIVEN `t = LocalTime.of(23, 50)`
- WHEN `t.plusMinutes(15)` is called
- THEN an `Error` is thrown

#### Scenario: isAfter returns correct ordering

- GIVEN `a = LocalTime.of(15, 0)` and `b = LocalTime.of(14, 30)`
- WHEN `a.isAfter(b)` is called
- THEN it returns `true`
- WHEN `b.isAfter(a)` is called
- THEN it returns `false`

---

### Requirement: TimeSlot value object

`TimeSlot` MUST be an immutable value object representing a contiguous time interval
within a single day.

- Construction: `TimeSlot.of(start: LocalTime, end: LocalTime)` — `end` MUST be
  strictly after `start`; otherwise throws.
- `contains(time: LocalTime): boolean` — returns `true` when `start <= time < end`.
- `overlaps(other: TimeSlot): boolean` — returns `true` when the two intervals share
  at least one instant (standard half-open interval overlap: `this.start < other.end &&
  other.start < this.end`).
- `shiftBy(minutes: number): TimeSlot` — returns a new `TimeSlot` with both start and
  end advanced by `minutes` via `LocalTime.plusMinutes`.

#### Scenario: valid construction

- GIVEN `start = LocalTime.of(14, 0)` and `end = LocalTime.of(14, 30)`
- WHEN `TimeSlot.of(start, end)` is called
- THEN the instance is created successfully

#### Scenario: end not after start rejects construction

- GIVEN `start = LocalTime.of(14, 0)` and `end = LocalTime.of(14, 0)`
- WHEN `TimeSlot.of(start, end)` is called
- THEN an `Error` is thrown

#### Scenario: overlaps detects shared interval

- GIVEN `a = TimeSlot.of(14:00, 14:30)` and `b = TimeSlot.of(14:15, 14:45)`
- WHEN `a.overlaps(b)` is called
- THEN it returns `true`

#### Scenario: adjacent slots do not overlap

- GIVEN `a = TimeSlot.of(14:00, 14:30)` and `b = TimeSlot.of(14:30, 15:00)`
- WHEN `a.overlaps(b)` is called
- THEN it returns `false`

---

### Requirement: WorkingHours value object

`WorkingHours` MUST be an immutable value object with `open: LocalTime` and
`close: LocalTime`, where `close` is strictly after `open`.

- `containsSlot(slot: TimeSlot): boolean` — returns `true` when
  `slot.start >= open && slot.end <= close`.
- `slotOverflowsClose(slot: TimeSlot): boolean` — returns `true` when
  `slot.end` is strictly after `close` (i.e., the slot's end exceeds closing time).

#### Scenario: slot within working hours

- GIVEN `wh = WorkingHours { open: 09:00, close: 17:00 }`
- AND `slot = TimeSlot.of(14:00, 14:30)`
- WHEN `wh.containsSlot(slot)` is called
- THEN it returns `true`

#### Scenario: slot that overflows closing time is detected

- GIVEN `wh = WorkingHours { open: 09:00, close: 17:00 }`
- AND `slot = TimeSlot.of(16:40, 17:10)`
- WHEN `wh.slotOverflowsClose(slot)` is called
- THEN it returns `true`

---

### Requirement: Appointment value object

`Appointment` MUST be an immutable value object.

- Shape: `{ id: string, patientId: string, slot: TimeSlot }`.
- All three fields are required; construction with any missing or null field MUST throw.
- `withSlot(newSlot: TimeSlot): Appointment` — returns a NEW `Appointment` with the
  same `id` and `patientId` but the given `newSlot`. The original is unchanged.

#### Scenario: construction succeeds with all fields

- GIVEN `id = 'appt-1'`, `patientId = 'patient-1'`, `slot = TimeSlot.of(14:00, 14:30)`
- WHEN the `Appointment` is constructed
- THEN the instance is created with all fields accessible

#### Scenario: withSlot returns new instance with same identity

- GIVEN `appt = Appointment { id: 'appt-1', patientId: 'patient-1', slot: 14:00–14:30 }`
- WHEN `appt.withSlot(TimeSlot.of(14:40, 15:10))` is called
- THEN a new `Appointment` is returned with `slot = 14:40–15:10`
- AND the original `appt` still has `slot = 14:00–14:30`
- AND the new appointment has `id = 'appt-1'` and `patientId = 'patient-1'`

---

### Requirement: Agenda value object

`Agenda` MUST be an immutable, ordered collection of `Appointment`s associated with
a `WorkingHours`.

- Shape: `{ appointments: readonly Appointment[], workingHours: WorkingHours }`.
- Appointments are ordered by `slot.start` ascending; construction MUST enforce this
  ordering or accept an already-ordered list (implementation choice, but the invariant
  holds at construction time).
- The `appointments` collection is read-only; no method mutates the `Agenda` in place.
- `size(): number` — returns the count of appointments.

#### Scenario: agenda holds ordered appointments

- GIVEN four appointments at 14:00, 14:30, 15:00, 15:30
- WHEN the `Agenda` is constructed with those appointments in order
- THEN `agenda.size()` returns `4`
- AND `agenda.appointments[0].slot.start` equals `14:00`

---

### Requirement: Plan (immutable)

`Plan` MUST be an immutable record with:

- `operations: readonly PlanOperation[]` — ordered list of proposed changes.
- `conflicts: readonly Conflict[]` — list of flagged issues requiring review.
- No mutation methods. `Plan` MUST NOT expose any method that alters its state.

`PlanOperation` shape:

```
{ type: 'move', appointmentId: string, patientId: string, from: TimeSlot, to: TimeSlot }
```

`Conflict` shape:

```
{ appointmentId: string, reason: 'OVERFLOWS_CLOSING', proposedSlot: TimeSlot }
```

The `reason` field is a string literal union; `'OVERFLOWS_CLOSING'` is the only
value for Phase 1. The shape leaves room for a `resolution` field to be added in
Phase 4 without breaking existing consumers.

#### Scenario: plan holds operations and conflicts

- GIVEN two `PlanOperation`s and one `Conflict` are assembled
- WHEN a `Plan` is constructed
- THEN `plan.operations.length` equals `2`
- AND `plan.conflicts.length` equals `1`
- AND attempting to assign to `plan.operations` does not mutate the original array

---

### Requirement: Intent value type and UnsupportedIntentError

`Intent` MUST be the shape `{ kind: string, params: Record<string, unknown> }`.

`UnsupportedIntentError` MUST be a named error class extending `Error` that carries
the unsupported `kind` string. It MUST be constructable with `new UnsupportedIntentError(kind)`.

#### Scenario: UnsupportedIntentError carries the kind

- GIVEN `kind = 'TELEPORT'`
- WHEN `new UnsupportedIntentError('TELEPORT')` is constructed
- THEN `error.kind` equals `'TELEPORT'`
- AND `error instanceof Error` is `true`

---

### Requirement: Planner registry and recalculate

`buildPlannerRegistry(): Map<string, Planner>` MUST return a `Map` that contains at
least the `'DELAY'` entry mapped to a `DelayPlanner` instance.

`recalculate(registry: Map<string, Planner>, agenda: Agenda, intent: Intent): Plan`
MUST be a pure function with no side effects.

- It MUST look up `intent.kind` in the registry.
- If a planner is found, it MUST delegate to `planner.plan(agenda, intent)` and
  return the resulting `Plan`.
- If no planner is found for `intent.kind`, it MUST throw `UnsupportedIntentError`
  with the unknown kind. It MUST NOT return a default or empty plan silently.
- `recalculate` MUST NOT read or write any module-level state; all state flows through
  its arguments.

#### Scenario: known intent delegates to the correct planner

- GIVEN `registry = buildPlannerRegistry()`
- AND `intent = { kind: 'DELAY', params: { minutes: 40 } }`
- WHEN `recalculate(registry, agenda, intent)` is called
- THEN the result is a `Plan` produced by `DelayPlanner`

#### Scenario: unknown intent throws UnsupportedIntentError

- GIVEN `registry = buildPlannerRegistry()`
- AND `intent = { kind: 'TELEPORT', params: {} }`
- WHEN `recalculate(registry, agenda, intent)` is called
- THEN `UnsupportedIntentError` is thrown
- AND the error carries `kind = 'TELEPORT'`
- AND no `Plan` is returned

---

### Requirement: DelayPlanner

`DelayPlanner` MUST implement the `Planner` interface:
`plan(agenda: Agenda, intent: Intent): Plan`.

**Input validation:**

- `intent.params.minutes` MUST be a number strictly greater than zero.
- If `minutes` is absent, non-numeric, zero, or negative, `DelayPlanner` MUST throw
  an `Error` with a descriptive message. It MUST NOT silently treat invalid input as
  zero or default to any value.

**Operation production:**

- For EVERY appointment in `agenda.appointments`, `DelayPlanner` MUST produce one
  `PlanOperation` of type `'move'`.
- The `to` slot is computed by shifting both `slot.start` and `slot.end` forward by
  exactly `params.minutes` minutes.
- Operations MUST preserve the original appointment order.
- The original `Agenda` MUST NOT be mutated; all shifted slots are new `TimeSlot`
  instances.

**Conflict detection:**

- For each shifted appointment, if the new slot's end is strictly after
  `agenda.workingHours.close`, `DelayPlanner` MUST add a `Conflict` entry:
  `{ appointmentId, reason: 'OVERFLOWS_CLOSING', proposedSlot: <new shifted slot> }`.
- Appointments whose new end is at or before `close` MUST NOT be flagged.
- `DelayPlanner` MUST NOT propose a resolution; flagging only (Phase 4 handles resolution).

#### Scenario: invalid minutes — zero

- GIVEN `intent = { kind: 'DELAY', params: { minutes: 0 } }`
- WHEN `DelayPlanner.plan(agenda, intent)` is called
- THEN an `Error` is thrown

#### Scenario: invalid minutes — negative

- GIVEN `intent = { kind: 'DELAY', params: { minutes: -5 } }`
- WHEN `DelayPlanner.plan(agenda, intent)` is called
- THEN an `Error` is thrown

#### Scenario: invalid minutes — non-numeric

- GIVEN `intent = { kind: 'DELAY', params: { minutes: 'soon' } }`
- WHEN `DelayPlanner.plan(agenda, intent)` is called
- THEN an `Error` is thrown

#### Scenario: all appointments shifted, no conflicts

- GIVEN working hours `09:00–17:00`
- AND agenda with four appointments:
  - `appt-1` `14:00–14:30` (patient `p-1`)
  - `appt-2` `14:30–15:00` (patient `p-2`)
  - `appt-3` `15:00–15:30` (patient `p-3`)
  - `appt-4` `15:30–16:00` (patient `p-4`)
- AND `intent = { kind: 'DELAY', params: { minutes: 40 } }`
- WHEN `DelayPlanner.plan(agenda, intent)` is called
- THEN the plan contains exactly 4 operations:
  - `appt-1`: `from 14:00–14:30` → `to 14:40–15:10`
  - `appt-2`: `from 14:30–15:00` → `to 15:10–15:40`
  - `appt-3`: `from 15:00–15:30` → `to 15:40–16:10`
  - `appt-4`: `from 15:30–16:00` → `to 16:10–16:40`
- AND `plan.conflicts` is empty (all new end times <= 17:00)
- AND the original agenda is unchanged

#### Scenario: appointment overflowing closing is flagged

- GIVEN working hours `09:00–17:00`
- AND agenda extends the previous four with a fifth appointment:
  - `appt-5` `16:00–16:30` (patient `p-5`)
- AND `intent = { kind: 'DELAY', params: { minutes: 40 } }`
- WHEN `DelayPlanner.plan(agenda, intent)` is called
- THEN the plan contains 5 operations (all 5 appointments shifted)
- AND `plan.conflicts` contains exactly 1 entry:
  - `appointmentId = 'appt-5'`
  - `reason = 'OVERFLOWS_CLOSING'`
  - `proposedSlot.end = 17:10` (which is after `close = 17:00`)
- AND the first four appointments have no corresponding conflict entry

---

### Requirement: Canonical acceptance — PRD Scenario 1 (DELAY 40 min)

This is the top-level acceptance criterion for Phase 1. A single test MUST pass that
exercises the full stack from `recalculate` down, imports NOTHING from `@nestjs/*`,
Postgres drivers, or HTTP adapters, and asserts the following in exact detail.

**Setup:**

```
workingHours = { open: 09:00, close: 17:00 }
appointments = [
  { id: 'appt-1', patientId: 'patient-1', slot: 14:00–14:30 },
  { id: 'appt-2', patientId: 'patient-2', slot: 14:30–15:00 },
  { id: 'appt-3', patientId: 'patient-3', slot: 15:00–15:30 },
  { id: 'appt-4', patientId: 'patient-4', slot: 15:30–16:00 },
]
agenda = Agenda { appointments, workingHours }
intent = { kind: 'DELAY', params: { minutes: 40 } }
registry = buildPlannerRegistry()
```

**Assert — operations (4 total, in order):**

| # | appointmentId | patientId | from | to |
|---|---------------|-----------|------|----|
| 0 | `appt-1` | `patient-1` | `14:00–14:30` | `14:40–15:10` |
| 1 | `appt-2` | `patient-2` | `14:30–15:00` | `15:10–15:40` |
| 2 | `appt-3` | `patient-3` | `15:00–15:30` | `15:40–16:10` |
| 3 | `appt-4` | `patient-4` | `15:30–16:00` | `16:10–16:40` |

**Assert — conflicts:**

`plan.conflicts` is an empty array (no appointment's new end exceeds 17:00; the
latest new end is 16:40).

**Assert — immutability:**

`agenda.appointments[0].slot.start.toString()` still equals `'14:00'` after
`recalculate` returns.

#### Scenario: PRD Scenario 1 — DELAY 40 min, clean result

- GIVEN the setup above
- WHEN `recalculate(registry, agenda, intent)` is called
- THEN `plan.operations.length` equals `4`
- AND each operation matches the table above exactly (appointmentId, patientId,
  from slot, to slot)
- AND `plan.conflicts.length` equals `0`
- AND the original `agenda` is unchanged

#### Scenario: PRD Scenario 1 — DELAY 40 min with overflow companion

- GIVEN the same setup, extended with a fifth appointment
  `{ id: 'appt-5', patientId: 'patient-5', slot: 16:00–16:30 }`
- WHEN `recalculate(registry, agenda, intent)` is called
- THEN `plan.operations.length` equals `5`
- AND `plan.conflicts.length` equals `1`
- AND `plan.conflicts[0].appointmentId` equals `'appt-5'`
- AND `plan.conflicts[0].reason` equals `'OVERFLOWS_CLOSING'`
- AND `plan.conflicts[0].proposedSlot.end.toString()` equals `'17:10'`

---

## Isolation constraint

Every test that verifies any part of this spec MUST satisfy the following assertion:

No module reachable from `apps/scheduling/src/domain/index.ts` may import from
`@nestjs/*`, `pg`, `typeorm`, `express`, or any HTTP/database adapter package.

This is verified structurally (import graph) — not just by running the tests in
isolation.

---

## Deferred (explicit out-of-scope)

| Item | Deferred to |
|------|-------------|
| `apply(plan)` — write changes to persistence | Phase 4 |
| NestJS wiring, controllers, DI | Phase 2 |
| Postgres / TypeORM persistence | Phase 2 |
| Language client (calling `language` service) | Phase 2 / 3 |
| Clock injection (`params.from: 'now'` filtering) | Phase 4 |
| Conflict resolution proposals | Phase 4 |
| `CancelBlockPlanner` | Phase 5 |
| UUID generation | Phase 2 (infra) |
| `src/messages/*` — MUST NOT be touched | — |

---

## Test runner

```
cd apps/scheduling && pnpm test
```

All scenarios in this spec MUST map to passing Jest unit tests under
`apps/scheduling/src/domain/`.
