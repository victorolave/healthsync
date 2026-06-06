# Design — Phase 1: The Scheduling Domain

The pure scheduling core lives in `apps/scheduling/src/domain/`: immutable value objects, an
operations-list `Plan`, a strategy `Planner` registry, and a single pure function
`recalculate(registry, agenda, intent) -> Plan`. Zero framework imports, built test-first. This
document is the implementation blueprint — the tasks/apply phases should be able to write code from it
without architectural choices left to make.

## Quick path (what apply will build, in order)

1. `time/local-time.ts` — `LocalTime` value object (the arithmetic primitive).
2. `agenda/time-slot.ts`, `agenda/appointment.ts`, `agenda/working-hours.ts`, `agenda/agenda.ts` — the data the day is made of.
3. `plan/plan.ts` — `Plan`, `PlanOperation`, `Conflict` (the immutable change-set).
4. `intent/intent.ts`, `intent/unsupported-intent.error.ts` — intent value + typed domain error.
5. `planning/planner.ts` — the `Planner` contract.
6. `planning/delay-planner.ts` — the DELAY strategy.
7. `planning/planner-registry.ts` — `buildPlannerRegistry()` + `PlannerRegistry` type.
8. `planning/recalculate.ts` — the pure dispatch function.
9. `index.ts` — barrel re-exporting the public surface.

Each step is red-green: write the spec first, watch it fail, implement until green. The keystone test is
PRD Scenario 1 (DELAY 40) against `recalculate`.

## File tree under `apps/scheduling/src/domain/`

Flat, screaming structure — folders name domain concepts, not technical layers (Decision 7).

```
apps/scheduling/src/domain/
├── time/
│   ├── local-time.ts                 # LocalTime VO + factory
│   └── local-time.spec.ts            # arithmetic, comparison, formatting
├── agenda/
│   ├── time-slot.ts                  # TimeSlot VO (start/end LocalTime)
│   ├── time-slot.spec.ts
│   ├── appointment.ts                # Appointment VO (id, patientId, slot)
│   ├── working-hours.ts              # WorkingHours VO (open/close LocalTime)
│   ├── agenda.ts                     # Agenda VO (appointments + workingHours)
│   └── agenda.spec.ts                # construction + immutability
├── plan/
│   ├── plan.ts                       # Plan, PlanOperation, Conflict types + factory
│   └── plan.spec.ts                  # empty plan, immutability
├── intent/
│   ├── intent.ts                     # Intent value type
│   └── unsupported-intent.error.ts   # UnsupportedIntentError domain error
├── planning/
│   ├── planner.ts                    # Planner contract (interface)
│   ├── delay-planner.ts              # DelayPlanner implements Planner
│   ├── delay-planner.spec.ts         # DELAY shift + overflow conflict
│   ├── planner-registry.ts           # PlannerRegistry type + buildPlannerRegistry()
│   ├── recalculate.ts                # recalculate(registry, agenda, intent) -> Plan
│   └── recalculate.spec.ts           # KEYSTONE: PRD Scenario 1 + unsupported kind
└── index.ts                          # public barrel
```

### Responsibility + exports per file

| File | Responsibility | Exports |
|------|----------------|---------|
| `time/local-time.ts` | Wall-clock time arithmetic in a single timezone. Stores minutes-since-midnight internally. | `LocalTime` (class), `localTime(hours, minutes)` factory |
| `agenda/time-slot.ts` | A start→end interval. | `TimeSlot` (interface), `timeSlot(start, end)` factory |
| `agenda/appointment.ts` | One booking: identity, patient, when. | `Appointment` (interface) |
| `agenda/working-hours.ts` | The day's open/close boundary. | `WorkingHours` (interface), `workingHours(open, close)` factory |
| `agenda/agenda.ts` | The day handed to recalculate: appointments + hours. | `Agenda` (interface), `agenda(appointments, hours)` factory |
| `plan/plan.ts` | The immutable change-set output. | `Plan`, `PlanOperation`, `Conflict`, `MovePlanOperation` types; `emptyPlan()`, `planOf(ops, conflicts)` factories |
| `intent/intent.ts` | Behavior-free intent value (data only). | `Intent` (interface) |
| `intent/unsupported-intent.error.ts` | Typed error for unregistered kinds. | `UnsupportedIntentError` (class) |
| `planning/planner.ts` | The strategy contract. | `Planner` (interface) |
| `planning/delay-planner.ts` | DELAY semantics: uniform shift + overflow flag. | `DelayPlanner` (class) |
| `planning/planner-registry.ts` | kind→planner map + composition root. | `PlannerRegistry` (type), `buildPlannerRegistry()` |
| `planning/recalculate.ts` | Pure dispatch by `intent.kind`. | `recalculate(registry, agenda, intent)` |
| `index.ts` | Public surface for Phase 2 adapters. | re-exports all of the above |

## Type signatures (concrete TS)

### `time/local-time.ts`

```ts
// Immutable wall-clock time, single timezone, no Date/UTC contamination (Decision 3).
// Internal representation: minutes since midnight (encapsulated, never exposed raw).
export class LocalTime {
  private constructor(private readonly minutesSinceMidnight: number) {}

  static of(hours: number, minutes: number): LocalTime {
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
      throw new RangeError('LocalTime requires integer hours and minutes');
    }
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new RangeError(`LocalTime out of range: ${hours}:${minutes}`);
    }
    return new LocalTime(hours * 60 + minutes);
  }

  plusMinutes(delta: number): LocalTime {
    if (!Number.isInteger(delta)) {
      throw new RangeError('plusMinutes requires an integer');
    }
    const next = this.minutesSinceMidnight + delta;
    if (next < 0 || next > 23 * 60 + 59) {
      throw new RangeError('LocalTime arithmetic overflowed the day');
    }
    return new LocalTime(next);
  }

  isAfter(other: LocalTime): boolean {
    return this.minutesSinceMidnight > other.minutesSinceMidnight;
  }

  compareTo(other: LocalTime): number {
    return this.minutesSinceMidnight - other.minutesSinceMidnight;
  }

  equals(other: LocalTime): boolean {
    return this.minutesSinceMidnight === other.minutesSinceMidnight;
  }

  toString(): string {
    const h = Math.floor(this.minutesSinceMidnight / 60);
    const m = this.minutesSinceMidnight % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

export const localTime = (hours: number, minutes: number): LocalTime =>
  LocalTime.of(hours, minutes);
```

> Note on `plusMinutes` overflow: a DELAY that pushes an appointment past 23:59 is a malformed day for
> the MVP and is correctly a programmer/data error (throw `RangeError`). The OVERFLOWS_CLOSING *business*
> conflict (past `WorkingHours.close`, e.g. 17:00) is detected by the planner, not by `LocalTime` — these
> are two different things and must not be conflated.

### `agenda/time-slot.ts`

```ts
import type { LocalTime } from '../time/local-time';

// A booked interval. start/end are LocalTime VOs; immutability comes from readonly + frozen factory.
export interface TimeSlot {
  readonly start: LocalTime;
  readonly end: LocalTime;
}

export const timeSlot = (start: LocalTime, end: LocalTime): TimeSlot => {
  if (!end.isAfter(start)) {
    throw new RangeError('TimeSlot end must be after start');
  }
  return Object.freeze({ start, end });
};
```

### `agenda/appointment.ts`

```ts
import type { TimeSlot } from './time-slot';

// patientId included now (Decision 6): PlanOperation must tell notifications WHO moved.
// id/patientId are plain strings ('appt-1', 'patient-1') — no UUID generation in Phase 1.
export interface Appointment {
  readonly id: string;
  readonly patientId: string;
  readonly slot: TimeSlot;
}

export const appointment = (
  id: string,
  patientId: string,
  slot: TimeSlot,
): Appointment => Object.freeze({ id, patientId, slot });
```

### `agenda/working-hours.ts`

```ts
import type { LocalTime } from '../time/local-time';

export interface WorkingHours {
  readonly open: LocalTime;
  readonly close: LocalTime;
}

export const workingHours = (open: LocalTime, close: LocalTime): WorkingHours => {
  if (!close.isAfter(open)) {
    throw new RangeError('WorkingHours close must be after open');
  }
  return Object.freeze({ open, close });
};
```

### `agenda/agenda.ts`

```ts
import type { Appointment } from './appointment';
import type { WorkingHours } from './working-hours';

// The remaining day handed to recalculate. The APP LAYER (Phase 2) decides which appointments
// are "remaining"; the domain treats whatever it receives as the full set to operate on (Decision 4).
export interface Agenda {
  readonly appointments: readonly Appointment[];
  readonly workingHours: WorkingHours;
}

export const agenda = (
  appointments: readonly Appointment[],
  hours: WorkingHours,
): Agenda =>
  Object.freeze({
    appointments: Object.freeze([...appointments]),
    workingHours: hours,
  });
```

### `intent/intent.ts`

```ts
// Behavior-free value, shape aligned with src/messages/dto/intent-response.dto.ts (Decision 2/ADR-0005).
// In Phase 2 the language port supplies this; in Phase 1 tests construct it directly.
// params is intentionally loose (Record<string, unknown>) — each Planner validates the params IT needs.
export interface Intent {
  readonly kind: string;
  readonly params: Record<string, unknown>;
}
```

> Why `Record<string, unknown>` and not a discriminated union: the intent crosses the
> `language/ → scheduling/` boundary as raw data (ADR-0005). Tightening it into a union here would couple
> the two contexts and force edits to existing code when an intent is added — exactly what ADR-0005
> forbids. Validation is the planner's job (Risk: loose params), done at the edge where the shape is known.

### `intent/unsupported-intent.error.ts`

```ts
// Thrown when no planner is registered for intent.kind (Decision 2, ADR-0005: never silent).
export class UnsupportedIntentError extends Error {
  readonly kind: string;

  constructor(kind: string) {
    super(`No planner registered for intent kind: ${kind}`);
    this.name = 'UnsupportedIntentError';
    this.kind = kind;
    // Restore prototype chain for instanceof across the TS target (defensive).
    Object.setPrototypeOf(this, UnsupportedIntentError.prototype);
  }
}
```

### `plan/plan.ts`

```ts
import type { TimeSlot } from '../agenda/time-slot';

// Operations-list + conflicts (Decision 1, ADR-0004). The change-set IS the source of truth
// for who/where notifications need. The "proposed agenda view" is derived from operations in Phase 4.

// 'type' field present now so future op kinds (e.g. 'cancel') extend without reshaping (Phase 5).
export interface MovePlanOperation {
  readonly type: 'move';
  readonly appointmentId: string;
  readonly from: TimeSlot;
  readonly to: TimeSlot;
}

export type PlanOperation = MovePlanOperation;

// Flag-only in Phase 1 (Decision 5). proposedSlot describes the OFFENDING slot; resolution is Phase 4.
// 'reason' is a string-literal union so Phase 4/5 can extend it (add a member) without rewriting.
export interface Conflict {
  readonly appointmentId: string;
  readonly reason: 'OVERFLOWS_CLOSING';
  readonly proposedSlot: TimeSlot;
}

export interface Plan {
  readonly operations: readonly PlanOperation[];
  readonly conflicts: readonly Conflict[];
}

export const emptyPlan = (): Plan =>
  Object.freeze({ operations: Object.freeze([]), conflicts: Object.freeze([]) });

export const planOf = (
  operations: readonly PlanOperation[],
  conflicts: readonly Conflict[],
): Plan =>
  Object.freeze({
    operations: Object.freeze([...operations]),
    conflicts: Object.freeze([...conflicts]),
  });
```

### `planning/planner.ts`

```ts
import type { Agenda } from '../agenda/agenda';
import type { Intent } from '../intent/intent';
import type { Plan } from '../plan/plan';

// The strategy contract (Decision 2, ADR-0005): one handler per intent kind, common shape (agenda, intent) -> Plan.
export interface Planner {
  plan(agenda: Agenda, intent: Intent): Plan;
}
```

### `planning/delay-planner.ts`

```ts
import type { Planner } from './planner';
import type { Agenda } from '../agenda/agenda';
import type { Intent } from '../intent/intent';
import type { Plan, PlanOperation, Conflict } from '../plan/plan';
import { planOf } from '../plan/plan';
import { timeSlot } from '../agenda/time-slot';

export class DelayPlanner implements Planner {
  plan(agenda: Agenda, intent: Intent): Plan {
    const minutes = this.readMinutes(intent);

    const operations: PlanOperation[] = [];
    const conflicts: Conflict[] = [];

    for (const appt of agenda.appointments) {
      const movedSlot = timeSlot(
        appt.slot.start.plusMinutes(minutes),
        appt.slot.end.plusMinutes(minutes),
      );

      operations.push({
        type: 'move',
        appointmentId: appt.id,
        from: appt.slot,
        to: movedSlot,
      });

      if (movedSlot.end.isAfter(agenda.workingHours.close)) {
        conflicts.push({
          appointmentId: appt.id,
          reason: 'OVERFLOWS_CLOSING',
          proposedSlot: movedSlot,
        });
      }
    }

    return planOf(operations, conflicts);
  }

  // Validation is the planner's responsibility (Risk: loose params).
  private readMinutes(intent: Intent): number {
    const raw = intent.params.minutes;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || !Number.isInteger(raw)) {
      throw new RangeError(
        `DELAY requires a positive integer 'minutes' param, received: ${String(raw)}`,
      );
    }
    return raw;
  }
}
```

> `params.from` (e.g. `'now'`) is deliberately IGNORED in Phase 1 (Decision 4). Honoring "from now"
> needs a Clock port, which would break purity. The Agenda handed in already represents the set to shift;
> the app layer selects "remaining" in Phase 2.

### `planning/planner-registry.ts`

```ts
import type { Planner } from './planner';
import { DelayPlanner } from './delay-planner';

// kind -> Planner. The single extension point (ADR-0005). Phase 5 adds CancelBlockPlanner here = 1 line.
export type PlannerRegistry = ReadonlyMap<string, Planner>;

// Composition root for the domain's strategies (Decision 2, registry injected into recalculate / B3).
export const buildPlannerRegistry = (): PlannerRegistry =>
  new Map<string, Planner>([['DELAY', new DelayPlanner()]]);
```

### `planning/recalculate.ts`

```ts
import type { PlannerRegistry } from './planner-registry';
import type { Agenda } from '../agenda/agenda';
import type { Intent } from '../intent/intent';
import type { Plan } from '../plan/plan';
import { UnsupportedIntentError } from '../intent/unsupported-intent.error';

// THE pure function. No module singletons, no Clock, no I/O. Registry is injected (B3).
export const recalculate = (
  registry: PlannerRegistry,
  agenda: Agenda,
  intent: Intent,
): Plan => {
  const planner = registry.get(intent.kind);
  if (planner === undefined) {
    throw new UnsupportedIntentError(intent.kind);
  }
  return planner.plan(agenda, intent);
};
```

### `index.ts` (public barrel)

```ts
export { LocalTime, localTime } from './time/local-time';
export type { TimeSlot } from './agenda/time-slot';
export { timeSlot } from './agenda/time-slot';
export type { Appointment } from './agenda/appointment';
export { appointment } from './agenda/appointment';
export type { WorkingHours } from './agenda/working-hours';
export { workingHours } from './agenda/working-hours';
export type { Agenda } from './agenda/agenda';
export { agenda } from './agenda/agenda';
export type { Plan, PlanOperation, MovePlanOperation, Conflict } from './plan/plan';
export { emptyPlan, planOf } from './plan/plan';
export type { Intent } from './intent/intent';
export { UnsupportedIntentError } from './intent/unsupported-intent.error';
export type { Planner } from './planning/planner';
export { DelayPlanner } from './planning/delay-planner';
export type { PlannerRegistry } from './planning/planner-registry';
export { buildPlannerRegistry } from './planning/planner-registry';
export { recalculate } from './planning/recalculate';
```

## DelayPlanner algorithm (step by step)

1. **Validate `params.minutes`** via `readMinutes`. Reject non-number, non-finite, non-integer, or `<= 0`.
   Throw `RangeError` with the offending value. This is the planner's job — the intent params are loose by design.
2. **Initialize** mutable local `operations` and `conflicts` arrays (mutable *inside* the function;
   the returned `Plan` is frozen — local mutation for assembly is fine and readable).
3. **Iterate** `agenda.appointments` in order (uniform shift — every appointment, Decision 4):
   1. Compute `movedSlot = timeSlot(start.plusMinutes(minutes), end.plusMinutes(minutes))`.
      `LocalTime.plusMinutes` produces new immutable instances; the original appointment is never mutated.
   2. Push a `MovePlanOperation` `{ type:'move', appointmentId, from: original slot, to: movedSlot }`.
   3. **Detect overflow**: if `movedSlot.end.isAfter(agenda.workingHours.close)`, push a
      `Conflict { appointmentId, reason:'OVERFLOWS_CLOSING', proposedSlot: movedSlot }`. Flag only — no resolution (Decision 5).
4. **Assemble** the immutable `Plan` via `planOf(operations, conflicts)` (defensive copy + `Object.freeze`).
5. **Return**. The input `Agenda` is never touched — verifiable by asserting referential/structural equality
   of the original appointments after the call (a required test).

### Worked keystone (PRD Scenario 1, DELAY 40)

Input appointments `[14:00–14:30, 14:30–15:00, 15:00–15:30, 15:30–16:00]`, WH `09:00–17:00`, DELAY 40:
- operations move each +40 → `14:40–15:10, 15:10–15:40, 15:40–16:10, 16:10–16:40`
- `16:40 < 17:00` for all → `conflicts = []`
- original Agenda unchanged.

Conflict companion: add `16:00–16:30` → moved `16:40–17:10`; `17:10.isAfter(17:00)` is true →
one `Conflict { appointmentId:'appt-5', reason:'OVERFLOWS_CLOSING', proposedSlot: 16:40–17:10 }`.

## Immutability strategy

Picked: **`readonly` types + factory functions that `Object.freeze` + private-constructor for `LocalTime`**.
This is the teachable, codebase-fitting middle ground.

| Construct | Strategy | Why |
|-----------|----------|-----|
| `LocalTime` | `class` + `private constructor` + static `of` + instance methods returning new instances | It has *behavior* (arithmetic/comparison). A private constructor forces construction through validation; methods never mutate `this`. This is a textbook value object. |
| `TimeSlot`, `Appointment`, `WorkingHours`, `Agenda` | `interface` with `readonly` fields + `factory(...)` returning `Object.freeze({...})` | Pure data, no behavior. `readonly` gives compile-time safety; `Object.freeze` gives runtime safety (catches accidental mutation in tests/adapters). Plain objects keep them trivially serializable for Phase 2 persistence. |
| `Plan`, `PlanOperation`, `Conflict` | same: `readonly` interface + frozen factory; arrays wrapped in `Object.freeze([...source])` | The Plan is the contract handed across the hexagon boundary; runtime-frozen prevents an adapter from mutating it. |

Rules apply uniformly:
- Collections are copied then frozen (`Object.freeze([...appointments])`) so callers cannot mutate the
  internal array via the reference they passed in.
- No setters, no mutator methods anywhere in the domain.
- DelayPlanner mutates only *local* throwaway arrays during assembly, then freezes via `planOf`.

Rejected: bare `readonly` without `Object.freeze` (no runtime guard — a JS adapter could still mutate);
`class` everywhere (boilerplate for behavior-free data, hurts serialization); deep-freeze libraries
(dependency for a domain that must stay framework-free).

## Unknown-intent handling (Decision 5 of proposal / ADR-0005)

**Decision: `recalculate` THROWS a typed `UnsupportedIntentError` when the registry has no planner for
`intent.kind`.** It does NOT return an empty Plan, and does NOT return a Plan with a conflict.

Justification:
- ADR-0005 is explicit: an unknown kind "must be handled explicitly (treated as not-yet-supported,
  surfaced to the doctor) rather than silently ignored." A throw is the loudest, least-ignorable signal.
- An empty `Plan` is a *valid business result* (a DELAY of 0 appointments). Overloading it to also mean
  "I don't know this intent" would be a semantic lie — two different conditions sharing one representation.
- A `Conflict` is a *scheduling* conflict (OVERFLOWS_CLOSING). "Unknown intent" is not a scheduling
  problem; it's a capability gap. Mixing them pollutes the conflict channel.
- A typed error (carrying `.kind`) lets the Phase 2 HTTP adapter map it cleanly (e.g. 422 / "not yet
  supported") without string-sniffing. The domain stays honest; the adapter owns presentation.

## Test strategy (strict TDD)

Test command (run from the app, NOT the monorepo root):

```bash
cd apps/scheduling && pnpm test
```

Jest is configured inline in `apps/scheduling/package.json` (`rootDir: src`, `testRegex: .*\.spec\.ts$`,
ts-jest transform). Specs live next to sources as `*.spec.ts`.

Red-green order (each: write spec → run, see RED → implement → run, see GREEN → next):

| # | Spec file | First failing assertion (the RED) |
|---|-----------|-----------------------------------|
| 1 | `time/local-time.spec.ts` | `LocalTime.of(9,0).plusMinutes(40).toString()` === `'09:40'`; `of(14,0).isAfter(of(13,0))`; range rejection throws |
| 2 | `agenda/time-slot.spec.ts` | `timeSlot` rejects end ≤ start; exposes start/end |
| 3 | `agenda/agenda.spec.ts` | `agenda([...], wh)` is frozen; appointments array is a defensive copy |
| 4 | `plan/plan.spec.ts` | `emptyPlan()` has `operations:[] conflicts:[]` and is frozen |
| 5 | `planning/delay-planner.spec.ts` | DELAY 40 over one appointment shifts +40 and emits a `move` op; overflow emits `OVERFLOWS_CLOSING`; invalid `minutes` throws |
| 6 | `planning/recalculate.spec.ts` | **KEYSTONE** PRD Scenario 1 (4 appts +40, conflicts:[]); overflow companion; **unsupported kind throws `UnsupportedIntentError`**; **original Agenda unchanged after call**; imports nothing from `@nestjs/*`, no DB, no HTTP |

Keystone test sketch (`recalculate.spec.ts`):

```ts
import { localTime } from '../time/local-time';
import { timeSlot } from '../agenda/time-slot';
import { appointment } from '../agenda/appointment';
import { workingHours } from '../agenda/working-hours';
import { agenda } from '../agenda/agenda';
import { buildPlannerRegistry } from './planner-registry';
import { recalculate } from './recalculate';
import { UnsupportedIntentError } from '../intent/unsupported-intent.error';

describe('recalculate — DELAY (PRD Scenario 1)', () => {
  const wh = workingHours(localTime(9, 0), localTime(17, 0));
  const slot = (sh: number, sm: number, eh: number, em: number) =>
    timeSlot(localTime(sh, sm), localTime(eh, em));

  it('shifts every appointment by 40 min with no conflicts', () => {
    const day = agenda(
      [
        appointment('appt-1', 'patient-1', slot(14, 0, 14, 30)),
        appointment('appt-2', 'patient-2', slot(14, 30, 15, 0)),
        appointment('appt-3', 'patient-3', slot(15, 0, 15, 30)),
        appointment('appt-4', 'patient-4', slot(15, 30, 16, 0)),
      ],
      wh,
    );

    const plan = recalculate(buildPlannerRegistry(), day, {
      kind: 'DELAY',
      params: { minutes: 40 },
    });

    expect(plan.operations.map((o) => o.to.start.toString())).toEqual([
      '14:40', '15:10', '15:40', '16:10',
    ]);
    expect(plan.conflicts).toEqual([]);
    // original agenda untouched
    expect(day.appointments[0].slot.start.toString()).toBe('14:00');
  });

  it('flags OVERFLOWS_CLOSING when a moved appointment passes close', () => { /* add 16:00–16:30 */ });

  it('throws UnsupportedIntentError for an unregistered kind', () => {
    expect(() =>
      recalculate(buildPlannerRegistry(), agenda([], wh), { kind: 'TELEPORT', params: {} }),
    ).toThrow(UnsupportedIntentError);
  });
});
```

The "no framework" guarantee is enforced by construction: domain files import only from `../` siblings.
Verify (Phase verify) asserts zero `@nestjs/*`, no DB, no HTTP imports under `src/domain/`.

## Import / module conventions (state the rule, no guessing)

Verified against `src/messages/*` (e.g. `messages.service.ts` imports `'../dto/message.dto'`, `'./language.port'`).

- **Extensionless relative imports.** Write `from '../time/local-time'`, NOT `'../time/local-time.js'`.
  Despite `tsconfig` `moduleResolution: nodenext`, ts-jest resolves extensionless specifiers and the
  existing code uses them. The domain MUST match — do not introduce `.js` extensions.
- **`import type { ... }`** for type-only imports (matches `messages.service.ts` line 5: `import type { LanguagePort }`).
  Use `import type` for interfaces/types and a separate value import for factories/classes when both are needed
  from one module (`isolatedModules: true` makes this explicit and correct).
- **NO `@nestjs/*` imports anywhere under `src/domain/`.** No `@Injectable`, no `@Inject`, no DI tokens,
  no `reflect-metadata`. The registry is built by a plain factory function, not a Nest module. This is the
  whole point of Phase 1 (ADR-0002 hexagonal isolation) — the verify phase checks this explicitly.
- No barrel imports *within* the domain (import from concrete sibling files); `index.ts` exists only as the
  outward-facing surface for Phase 2 adapters.

## Checklist (apply/verify can confirm each)

- [ ] All files under `src/domain/` exist per the tree; folders are concept-named (no `entities/`, `services/`).
- [ ] `LocalTime` uses a private constructor + static `of`; methods return new instances.
- [ ] Value objects are `readonly` interfaces + `Object.freeze` factories; no setters.
- [ ] `Plan` = `{ operations, conflicts }`; `PlanOperation` is `{ type:'move', appointmentId, from, to }`.
- [ ] `Conflict` = `{ appointmentId, reason:'OVERFLOWS_CLOSING', proposedSlot }`; flag-only, no resolution.
- [ ] `Appointment` includes `patientId`.
- [ ] `DelayPlanner` validates `minutes` (positive integer) and ignores `params.from`.
- [ ] `recalculate` throws `UnsupportedIntentError` for unregistered kinds (never empty Plan / never silent).
- [ ] `buildPlannerRegistry()` registers `'DELAY' -> DelayPlanner` and returns a `ReadonlyMap`.
- [ ] Keystone PRD Scenario 1 test passes; overflow companion passes; original Agenda proven unchanged.
- [ ] Zero `@nestjs/*`, no DB, no HTTP imports under `src/domain/`.
- [ ] Imports are extensionless relative; `import type` used for type-only imports.

## Next step

Proceed to `sdd-tasks` (after the spec is also ready) to break this design into ordered, red-green
implementation steps. Phase 2 then consumes `src/domain/index.ts` from the HTTP adapter, persistence,
and language port — without modifying any file produced here.
