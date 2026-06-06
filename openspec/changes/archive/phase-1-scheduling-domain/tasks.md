# Tasks — Phase 1: The Scheduling Domain

**Change**: `phase-1-scheduling-domain`
**Delivery strategy**: `single-pr` (size:exception required — see Workload Forecast)
**TDD mode**: STRICT — every unit: red spec first, then green implementation, then refactor
**Test runner**: `cd apps/scheduling && pnpm test`
**Target root**: `apps/scheduling/src/domain/`

---

## Review Workload Forecast

| Metric                       | Estimate          |
|------------------------------|-------------------|
| New source files             | 13                |
| New spec files               | 8                 |
| Total new files              | 21                |
| Estimated changed lines      | ~650–750          |
| 400-line budget risk         | **HIGH**          |
| Chained PRs recommended      | Yes (if splitting)|
| `size:exception` required    | **YES**           |
| Decision needed before apply | **Yes**           |

This is a from-scratch domain. Every file is net-new. Paired spec + implementation files across 8 units, plus an index barrel, total roughly 650–750 lines. Delivery is locked to `single-pr` by session config — a **`size:exception`** must be recorded before `sdd-apply` starts. The entire domain is pure TypeScript with no framework dependencies, so there is no technical reason to block a single PR; the exception is administrative, not risk-driven.

---

## Dependency Order and Parallelism

```
T01 (LocalTime)
  └─► T02 (TimeSlot)
        └─► T03 (WorkingHours)
              └─► T04 (Appointment)
                    └─► T05 (Agenda)
                          └─► T06 (Plan + PlanOperation + Conflict)
                                └─► T07 (Intent type + UnsupportedIntentError)
                                      └─► T08 (Planner interface + PlannerRegistry)
                                            ├─► T09 (DelayPlanner)   ─┐
                                            └─► T10 (recalculate)    ─┤
                                                                       └─► T11 (PRD Scenario 1 acceptance test)
                                                                             └─► T12 (domain index barrel)
```

T01–T08 are strictly sequential (each layer uses the previous).
T09 and T10 are independent of each other once T08 exists; they can be written in parallel but must both be green before T11.
T11 is the keystone — only starts after T09 and T10 are green.
T12 (barrel) is mechanical and can only happen after T11 passes.

---

## Work Units

Each work unit = one commit. Format: `feat(domain): <outcome>`.
Tests are in the SAME commit as the implementation they verify.

---

### WU-01 — LocalTime value object

**Spec req**: LocalTime validates h∈[0–23], m∈[0–59]; plusMinutes returns new instance; overflow past 23:59 throws RangeError; isAfter; toString 'HH:MM'.

**Sequential after**: nothing (first unit)

#### [x] T01 — Write failing spec for LocalTime

- **File**: `apps/scheduling/src/domain/time/local-time.spec.ts`
- **Creates**: test suite with cases:
  - `of(14, 0)` constructs without error
  - `of(-1, 0)` throws RangeError
  - `of(0, 60)` throws RangeError
  - `of(14, 0).plusMinutes(30)` returns new LocalTime equal to 14:30
  - `of(14, 0).plusMinutes(30)` does not mutate the original
  - `of(23, 30).plusMinutes(40)` throws RangeError (overflow past midnight)
  - `of(15, 0).isAfter(of(14, 0))` → true; `of(14,0).isAfter(of(15,0))` → false
  - `of(14, 5).toString()` → `'14:05'`
- **Red gate**: run `cd apps/scheduling && pnpm test -- --testPathPattern=local-time` — must fail (file does not exist yet)

#### [x] T02 — Implement LocalTime to green

- **File**: `apps/scheduling/src/domain/time/local-time.ts`
- **Creates**:
  - `class LocalTime` with private constructor storing `minutesSinceMidnight: number`
  - `static of(h: number, m: number): LocalTime` — validates ranges, throws RangeError on invalid
  - `plusMinutes(n: number): LocalTime` — creates new instance; throws RangeError if result > 1439
  - `isAfter(other: LocalTime): boolean`
  - `compareTo(other: LocalTime): number` (for sorting)
  - `equals(other: LocalTime): boolean`
  - `toString(): string` — `HH:MM` zero-padded
  - Named factory alias: `export function localTime(h: number, m: number): LocalTime`
- **Green gate**: spec suite passes

**Commit message**: `feat(domain): add LocalTime value object with validation and arithmetic`

---

### WU-02 — TimeSlot value object

**Spec req**: `of(start, end)` requires end > start; `overlaps` half-open semantics; `shiftBy` returns new slot.

**Sequential after**: WU-01 (TimeSlot uses LocalTime)

#### [x] T03 — Write failing spec for TimeSlot

- **File**: `apps/scheduling/src/domain/agenda/time-slot.spec.ts`
- **Creates**: test cases:
  - `timeSlot(of(14,0), of(14,30))` constructs without error
  - `timeSlot(of(14,30), of(14,0))` throws RangeError (end ≤ start)
  - `timeSlot(of(14,0), of(14,0))` throws RangeError (equal not allowed)
  - `overlaps`: [14:00–14:30] overlaps [14:15–14:45] → true; [14:00–14:30] overlaps [14:30–15:00] → false (half-open: [start, end))
  - `shiftBy(40)` on [14:00–14:30] → [14:40–15:10], originals unchanged
- **Red gate**: run spec — must fail

#### [x] T04 — Implement TimeSlot to green

- **File**: `apps/scheduling/src/domain/agenda/time-slot.ts`
- **Creates**:
  - `interface TimeSlot { readonly start: LocalTime; readonly end: LocalTime }`
  - `function timeSlot(start: LocalTime, end: LocalTime): TimeSlot` — validates end > start (via compareTo), Object.freeze result
  - `function overlaps(a: TimeSlot, b: TimeSlot): boolean` — half-open: a.start < b.end && b.start < a.end
  - `function shiftBy(slot: TimeSlot, minutes: number): TimeSlot` — returns new frozen slot
- **Green gate**: spec suite passes

**Commit message**: `feat(domain): add TimeSlot value object with half-open overlap and shift`

---

### WU-03 — WorkingHours value object

**Spec req**: `containsSlot`; `slotOverflowsClose`.

**Sequential after**: WU-02 (WorkingHours uses TimeSlot)

#### [x] T05 — Write failing spec for WorkingHours

- **File**: `apps/scheduling/src/domain/agenda/working-hours.spec.ts`
- **Creates**: test cases:
  - `workingHours(of(9,0), of(17,0)).containsSlot(timeSlot(of(14,0), of(14,30)))` → true
  - `containsSlot` for slot starting before open → false
  - `containsSlot` for slot ending after close → false
  - `containsSlot` for slot ending exactly at close → true (inclusive close boundary)
  - `slotOverflowsClose(timeSlot(of(16,0), of(17,10)))` → true
  - `slotOverflowsClose(timeSlot(of(16,0), of(17,0)))` → false
- **Red gate**: must fail

#### [x] T06 — Implement WorkingHours to green

- **File**: `apps/scheduling/src/domain/agenda/working-hours.ts`
- **Creates**:
  - `interface WorkingHours { readonly open: LocalTime; readonly close: LocalTime }`
  - `function workingHours(open: LocalTime, close: LocalTime): WorkingHours` — Object.freeze
  - `function containsSlot(wh: WorkingHours, slot: TimeSlot): boolean` — `!slot.start.isAfter(wh.open) || ...` → correctly: `!slot.start.isAfter(wh.open) === false` — `slot.start.compareTo(wh.open) >= 0 && !slot.end.isAfter(wh.close)`
  - `function slotOverflowsClose(wh: WorkingHours, slot: TimeSlot): boolean` — `slot.end.isAfter(wh.close)`
- **Green gate**: spec suite passes

**Commit message**: `feat(domain): add WorkingHours with containsSlot and slotOverflowsClose`

---

### WU-04 — Appointment value object

**Spec req**: `{ id, patientId, slot }`; immutable; `withSlot` returns new instance.

**Sequential after**: WU-02 (Appointment uses TimeSlot)

> Note: WU-03 and WU-04 depend only on WU-02; they are parallel with each other but both sequential after WU-02. In practice, implement sequentially.

#### [x] T07 — Write failing spec for Appointment

- **File**: `apps/scheduling/src/domain/agenda/appointment.spec.ts`
- **Creates**: test cases:
  - `appointment('appt-1', 'patient-1', slot)` constructs frozen object
  - `withSlot(appt, newSlot)` returns new appointment with same id/patientId, different slot
  - original appointment is unchanged after `withSlot`
  - Attempt to mutate `appt.id` in strict mode → throws TypeError (frozen)
- **Red gate**: must fail

#### [x] T08 — Implement Appointment to green

- **File**: `apps/scheduling/src/domain/agenda/appointment.ts`
- **Creates**:
  - `interface Appointment { readonly id: string; readonly patientId: string; readonly slot: TimeSlot }`
  - `function appointment(id: string, patientId: string, slot: TimeSlot): Appointment` — Object.freeze
  - `function withSlot(appt: Appointment, slot: TimeSlot): Appointment` — returns new frozen Appointment
- **Green gate**: spec suite passes

**Commit message**: `feat(domain): add Appointment value object with immutable withSlot`

---

### WU-05 — Agenda value object

**Spec req**: `{ appointments: readonly, workingHours }`; ordered by slot.start.

**Sequential after**: WU-03 (WorkingHours) and WU-04 (Appointment)

#### [x] T09 — Write failing spec for Agenda

- **File**: `apps/scheduling/src/domain/agenda/agenda.spec.ts`
- **Creates**: test cases:
  - `agenda([appt3, appt1, appt2], wh)` sorts appointments by slot.start ascending
  - `agenda(appts, wh).appointments` is readonly frozen array
  - Mutating `agendaObj.appointments` throws (frozen)
  - `agenda` with no appointments constructs without error (empty list)
- **Red gate**: must fail

#### [x] T10 — Implement Agenda to green

- **File**: `apps/scheduling/src/domain/agenda/agenda.ts`
- **Creates**:
  - `interface Agenda { readonly appointments: readonly Appointment[]; readonly workingHours: WorkingHours }`
  - `function agenda(appointments: Appointment[], workingHours: WorkingHours): Agenda` — sorts by `slot.start.compareTo`, freezes array copy, Object.freeze result
- **Green gate**: spec suite passes

**Commit message**: `feat(domain): add Agenda value object with sorted appointments`

---

### WU-06 — Plan, PlanOperation, Conflict types

**Spec req**: `Plan = { operations: readonly PlanOperation[], conflicts: readonly Conflict[] }`; `PlanOperation = MovePlanOperation`; `Conflict = { appointmentId, reason:'OVERFLOWS_CLOSING', proposedSlot }`; factory `emptyPlan()`, `planOf(ops,conflicts)`.

**Sequential after**: WU-02 (TimeSlot used in PlanOperation and Conflict)

#### [x] T11 — Write failing spec for Plan factories

- **File**: `apps/scheduling/src/domain/plan/plan.spec.ts`
- **Creates**: test cases:
  - `emptyPlan()` returns `{ operations: [], conflicts: [] }` (both frozen)
  - `planOf([op], [])` returns frozen plan with one operation
  - `planOf(ops, conflicts)` — mutating returned `.operations` throws (frozen)
  - `planOf` with a move operation carries correct `type:'move'`, `appointmentId`, `patientId`, `from`, `to`
  - `planOf` with a conflict carries correct `appointmentId`, `reason:'OVERFLOWS_CLOSING'`, `proposedSlot`
- **Red gate**: must fail

#### [x] T12 — Implement Plan to green

- **File**: `apps/scheduling/src/domain/plan/plan.ts`
- **Creates**:
  - `interface MovePlanOperation { readonly type: 'move'; readonly appointmentId: string; readonly patientId: string; readonly from: TimeSlot; readonly to: TimeSlot }`
  - `type PlanOperation = MovePlanOperation` (extensible union in future phases)
  - `interface Conflict { readonly appointmentId: string; readonly reason: 'OVERFLOWS_CLOSING'; readonly proposedSlot: TimeSlot }`
  - `interface Plan { readonly operations: readonly PlanOperation[]; readonly conflicts: readonly Conflict[] }`
  - `function emptyPlan(): Plan` — returns frozen plan with frozen empty arrays
  - `function planOf(operations: PlanOperation[], conflicts: Conflict[]): Plan` — freezes both arrays and the plan
- **Green gate**: spec suite passes

**Commit message**: `feat(domain): add Plan, PlanOperation, and Conflict types with frozen factories`

---

### WU-07 — Intent type and UnsupportedIntentError

**Spec req**: `Intent = { readonly kind: string; params: Record<string, unknown> }`; `UnsupportedIntentError extends Error` carrying `.kind`.

**Sequential after**: WU-06 (Intent used by planners; logically after Plan is solid)

> No spec file needed for pure types; UnsupportedIntentError gets its own test.

#### [x] T13 — Write failing spec for UnsupportedIntentError

- **File**: `apps/scheduling/src/domain/intent/unsupported-intent.error.spec.ts`
- **Creates**: test cases:
  - `new UnsupportedIntentError('UNKNOWN')` is an `instanceof Error`
  - `error.kind` === `'UNKNOWN'`
  - `error.message` contains the kind string
  - `error instanceof UnsupportedIntentError` → true (not just Error)
- **Red gate**: must fail

#### [x] T14 — Implement Intent type and UnsupportedIntentError to green

- **File (types only)**: `apps/scheduling/src/domain/intent/intent.ts`
  - `interface Intent { readonly kind: string; readonly params: Record<string, unknown> }`
- **File (class)**: `apps/scheduling/src/domain/intent/unsupported-intent.error.ts`
  - `export class UnsupportedIntentError extends Error { readonly kind: string; constructor(kind: string) { super(\`Unsupported intent kind: "${kind}"\`); this.kind = kind; Object.setPrototypeOf(this, UnsupportedIntentError.prototype); } }`
- **Green gate**: spec suite passes

**Commit message**: `feat(domain): add Intent type and UnsupportedIntentError`

---

### WU-08 — Planner interface and PlannerRegistry

**Spec req**: `Planner` interface `plan(agenda, intent): Plan`; `PlannerRegistry = ReadonlyMap<string, Planner>`; `buildPlannerRegistry()` registers `'DELAY' → new DelayPlanner()`.

**Sequential after**: WU-07

> Planner interface is a pure type file; PlannerRegistry registration file is created here but `buildPlannerRegistry` will only be fully wired in WU-10 after DelayPlanner exists. We define the interface and the registry shape now so DelayPlanner and recalculate can both reference them.

#### [x] T15 — Create Planner interface and registry types (no spec — pure types)

- **File**: `apps/scheduling/src/domain/planning/planner.ts`
  - `interface Planner { plan(agenda: Agenda, intent: Intent): Plan }`
- **File (skeleton)**: `apps/scheduling/src/domain/planning/planner-registry.ts`
  - `type PlannerRegistry = ReadonlyMap<string, Planner>`
  - `function buildPlannerRegistry(): PlannerRegistry` — returns empty Map for now (will be wired in WU-10)
- No spec for this task — pure structural types + skeleton; verified indirectly by T17/T18.

**Commit message**: `feat(domain): add Planner interface and PlannerRegistry skeleton`

---

### WU-09 — DelayPlanner

**Spec req**: validates `params.minutes` (positive integer, else RangeError); shifts every appointment by `params.minutes`; flags `OVERFLOWS_CLOSING`; no mutation; no resolution proposals.

**Sequential after**: WU-08
**Parallel with**: WU-10 (recalculate) — both depend on WU-08; neither depends on the other

#### [x] T16 — Write failing spec for DelayPlanner

- **File**: `apps/scheduling/src/domain/planning/delay-planner.spec.ts`
- **Creates**: test cases:
  - `delayPlanner.plan(agenda, { kind:'DELAY', params:{ minutes:40 } })` shifts all appointments by 40 min
  - resulting operations: type is `'move'`; `from` matches original slot; `to` matches shifted slot
  - `params.minutes = 0` throws RangeError
  - `params.minutes = -5` throws RangeError
  - `params.minutes = 'forty'` throws RangeError
  - `params.minutes = 1.5` throws RangeError (non-integer)
  - original agenda is not mutated after plan()
  - appointment ending after `workingHours.close` after shift → conflict with `reason:'OVERFLOWS_CLOSING'` and correct `proposedSlot`
  - appointment ending at or before `workingHours.close` → no conflict for that appointment
- **Red gate**: must fail

#### [x] T17 — Implement DelayPlanner to green

- **File**: `apps/scheduling/src/domain/planning/delay-planner.ts`
- **Creates**:
  - `export class DelayPlanner implements Planner`
  - `plan(agenda: Agenda, intent: Intent): Plan`
  - Private `readMinutes(intent: Intent): number` — asserts `typeof params.minutes === 'number'`, `Number.isFinite`, `Number.isInteger`, `> 0`; throws RangeError on any violation
  - Algorithm (per design): iterate `agenda.appointments`; compute `movedSlot = timeSlot(start.plusMinutes(m), end.plusMinutes(m))`; push `MovePlanOperation`; if `slotOverflowsClose(agenda.workingHours, movedSlot)` push `Conflict`; return `planOf(ops, conflicts)`
  - Ignores `params.from` entirely (Decision 4)
- **Green gate**: all delay-planner spec cases pass

**Commit message**: `feat(domain): implement DelayPlanner with overflow conflict detection`

---

### WU-10 — recalculate dispatch function

**Spec req**: `recalculate(registry, agenda, intent): Plan`; dispatches by `intent.kind`; unknown kind throws `UnsupportedIntentError`; never silent.

**Sequential after**: WU-08
**Parallel with**: WU-09

#### [x] T18 — Write failing spec for recalculate

- **File**: `apps/scheduling/src/domain/planning/recalculate.spec.ts`
- **Creates**: test cases (using a minimal stub Planner injected via registry):
  - Known kind → delegates to the planner's `plan()` return value
  - Unknown kind → throws `UnsupportedIntentError` with `.kind` matching the intent kind
  - `UnsupportedIntentError` is `instanceof Error`
  - Result of delegation is the exact value the stub planner returned (pass-through)
- **Red gate**: must fail

#### [x] T19 — Implement recalculate to green

- **File**: `apps/scheduling/src/domain/planning/recalculate.ts`
- **Creates**:
  - `function recalculate(registry: PlannerRegistry, agenda: Agenda, intent: Intent): Plan`
  - `const planner = registry.get(intent.kind); if (!planner) throw new UnsupportedIntentError(intent.kind); return planner.plan(agenda, intent);`
- **Green gate**: recalculate spec passes

**Commit message**: `feat(domain): add recalculate dispatch with UnsupportedIntentError on unknown kind`

---

### WU-11 — Wire PlannerRegistry + PRD Scenario 1 acceptance test (KEYSTONE)

**Spec req**: PRD Scenario 1 end-to-end — `buildPlannerRegistry` wires `'DELAY' → new DelayPlanner()`; 4 appts at [14:00–14:30, …, 15:30–16:00]; WH 09:00–17:00; DELAY 40 → all shift correctly; conflicts: []; original agenda unchanged. Overflow companion: add appt-5 [16:00–16:30] → conflicts[0].

**Sequential after**: WU-09 AND WU-10 (both must be green)

#### [x] T20 — Wire buildPlannerRegistry with DelayPlanner

- **File (update)**: `apps/scheduling/src/domain/planning/planner-registry.ts`
- **Change**: import `DelayPlanner` and wire `'DELAY' → new DelayPlanner()` inside `buildPlannerRegistry()`
- No new spec — this wiring is validated by T21

#### [x] T21 — Write PRD Scenario 1 acceptance spec

- **File**: `apps/scheduling/src/domain/planning/recalculate-scenario1.spec.ts`
- **Creates**: Full acceptance test using real `buildPlannerRegistry()` (no stubs):

  **Happy path (no overflow)**:
  - Agenda: 4 appointments
    - appt-1: patient-1, [14:00–14:30]
    - appt-2: patient-2, [14:30–15:00]
    - appt-3: patient-3, [15:00–15:30]
    - appt-4: patient-4, [15:30–16:00]
  - WorkingHours: [09:00–17:00]
  - Intent: `{ kind: 'DELAY', params: { minutes: 40 } }`
  - Expected operations (4 move ops):
    - appt-1: from [14:00–14:30] to [14:40–15:10]
    - appt-2: from [14:30–15:00] to [15:10–15:40]
    - appt-3: from [15:00–15:30] to [15:40–16:10]
    - appt-4: from [15:30–16:00] to [16:10–16:40]
  - Expected conflicts: `[]`
  - Original agenda appointments unchanged

  **Overflow companion**:
  - Same agenda + appt-5: patient-5, [16:00–16:30]
  - Same DELAY 40 intent
  - conflicts[0]: `{ appointmentId: 'appt-5', reason: 'OVERFLOWS_CLOSING', proposedSlot.end.toString(): '17:10' }`
  - operations still contains all 5 moves

  **Unknown kind**:
  - Intent `{ kind: 'RESCHEDULE', params: {} }` → throws `UnsupportedIntentError` with `.kind === 'RESCHEDULE'`

  **Isolation assertion**:
  - All imports are extensionless relative paths under `src/domain/` — no `@nestjs/*`, no `pg`, no `typeorm`, no `express` reachable from domain
- **Red gate**: run `cd apps/scheduling && pnpm test -- --testPathPattern=recalculate-scenario1` — must fail (wiring not yet done at spec write time, or DelayPlanner not wired)

#### [x] T22 — Green gate: all tests pass

- After T20 wires DelayPlanner into registry, run full suite:
  ```
  cd apps/scheduling && pnpm test
  ```
- All 21 files (src/domain specs + existing app specs) must pass
- No `@nestjs` import must appear in any domain file (verify via grep: `grep -r '@nestjs' apps/scheduling/src/domain/ || echo "CLEAN"`)

**Commit message**: `feat(domain): wire PlannerRegistry with DelayPlanner; PRD Scenario 1 acceptance passing`

---

### WU-12 — Domain index barrel

**Spec req**: `index.ts` barrel for outward-facing consumers (Phase 2 adapter).

**Sequential after**: WU-11 (all tests green — barrel is the last touch)

#### [x] T23 — Create domain index barrel

- **File**: `apps/scheduling/src/domain/index.ts`
- **Exports** (grouped by layer):
  ```typescript
  // time
  export { LocalTime, localTime } from './time/local-time'
  // agenda
  export { timeSlot } from './agenda/time-slot'
  export type { TimeSlot } from './agenda/time-slot'
  export { workingHours } from './agenda/working-hours'
  export type { WorkingHours } from './agenda/working-hours'
  export { appointment, withSlot } from './agenda/appointment'
  export type { Appointment } from './agenda/appointment'
  export { agenda } from './agenda/agenda'
  export type { Agenda } from './agenda/agenda'
  // plan
  export { emptyPlan, planOf } from './plan/plan'
  export type { Plan, PlanOperation, MovePlanOperation, Conflict } from './plan/plan'
  // intent
  export type { Intent } from './intent/intent'
  export { UnsupportedIntentError } from './intent/unsupported-intent.error'
  // planning
  export type { Planner } from './planning/planner'
  export type { PlannerRegistry } from './planning/planner-registry'
  export { buildPlannerRegistry } from './planning/planner-registry'
  export { recalculate } from './planning/recalculate'
  ```
- No spec for the barrel (re-export; verified by T21/T22 indirectly)
- Run `cd apps/scheduling && pnpm test` one final time — must still be all green

**Commit message**: `feat(domain): export domain public API via index barrel`

---

## Summary Table

| WU  | Tasks     | Files created                                              | Spec req(s)                          | Sequential after | Parallel with |
|-----|-----------|------------------------------------------------------------|--------------------------------------|-----------------|--------------|
| 01  | T01, T02  | time/local-time.spec.ts, time/local-time.ts               | LocalTime                            | —               | —            |
| 02  | T03, T04  | agenda/time-slot.spec.ts, agenda/time-slot.ts             | TimeSlot                             | WU-01           | —            |
| 03  | T05, T06  | agenda/working-hours.spec.ts, agenda/working-hours.ts     | WorkingHours                         | WU-02           | WU-04        |
| 04  | T07, T08  | agenda/appointment.spec.ts, agenda/appointment.ts         | Appointment                          | WU-02           | WU-03        |
| 05  | T09, T10  | agenda/agenda.spec.ts, agenda/agenda.ts                   | Agenda                               | WU-03, WU-04    | —            |
| 06  | T11, T12  | plan/plan.spec.ts, plan/plan.ts                           | Plan/PlanOperation/Conflict          | WU-02           | WU-03, WU-04 |
| 07  | T13, T14  | intent/unsupported-intent.error.spec.ts, intent.ts, *.error.ts | Intent, UnsupportedIntentError | WU-06           | —            |
| 08  | T15       | planning/planner.ts, planning/planner-registry.ts         | Planner, PlannerRegistry (skeleton)  | WU-07           | —            |
| 09  | T16, T17  | planning/delay-planner.spec.ts, planning/delay-planner.ts | DelayPlanner                        | WU-08           | WU-10        |
| 10  | T18, T19  | planning/recalculate.spec.ts, planning/recalculate.ts     | recalculate dispatch                 | WU-08           | WU-09        |
| 11  | T20–T22   | planner-registry.ts (update), planning/recalculate-scenario1.spec.ts | PRD Scenario 1 (keystone) | WU-09, WU-10 | — |
| 12  | T23       | domain/index.ts                                           | public API barrel                    | WU-11           | —            |

**Total tasks**: 23 (12 spec-write tasks + 10 implementation tasks + 1 barrel)
**Total new files**: 21
**Estimated changed lines**: ~650–750
**`size:exception` required**: YES (single-pr delivery strategy, over 400-line budget)

---

## Strict TDD Checklist (per unit)

Before moving from any T(spec) to T(impl):

- [x] Run `cd apps/scheduling && pnpm test` and confirm the new spec file fails
- [x] The failure is a compilation error or assertion failure — not a setup error
- [x] Only after confirmed red, write the implementation

Before committing each WU:

- [x] All specs in the WU pass green
- [x] No regressions in previously passing specs
- [x] No `@nestjs/*`, `pg`, `typeorm`, or `express` imports under `src/domain/`
- [x] Commit message follows Conventional Commits format
