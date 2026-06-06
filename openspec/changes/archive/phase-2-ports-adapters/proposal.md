# Phase 2 — Ports & Adapters: connect the pure core to Postgres and HTTP

Phase 2 wires the tested scheduling domain to the outside world: a Prisma + Neon
Postgres persistence adapter (read path), and an inbound HTTP orchestration that
turns a doctor's message into a **proposed Plan**. The domain stays pure; all
technology lives in adapters. This is the plumbing that lets a real message reach
the known-good core — built around it, not before it.

> Stack is LOCKED (see `sdd/phase-2-ports-adapters/stack-decision`): **Prisma**
> ORM, **Neon** managed Postgres, user-provisioned `DATABASE_URL`. This proposal
> builds around that choice and does not reopen it.

## Intent

| Question | Answer |
|----------|--------|
| What problem | The domain can recalculate a Plan, but nothing can reach it. There is no persistence, no agenda hydration, no orchestration from `POST /messages` to a Plan. |
| Why now | BUILD-PLAN Phase 2: the domain already works and is tested (106 green). Adapters are plumbing — build them around a known-good core. |
| Success looks like | `POST /messages` → language interprets → map to domain `Intent` → load `Agenda` from Postgres → `recalculate` → return a serialized **proposed** `PlanResponseDto`. No writes. ADR-0002 invariant intact (zero `@prisma/*` in `src/domain/`). No-double-booking enforced at the DB. |

## Scope

### In scope

- **Persistence read path**: `AgendaRepository` port + Prisma adapter that loads
  the assembled `Agenda` (appointments + working hours) for a doctor + date.
- **DB schema + migrations** (Prisma Migrate): `working_hours`, `appointments`,
  `change_history` tables; the **no-double-booking** `EXCLUDE USING gist`
  constraint via raw SQL in a custom migration (`btree_gist`).
- **`ChangeHistoryRepository` port + schema** laid down for Phase 4. Schema and
  port interface only — no adapter, no writes (see Decision 8).
- **Inbound HTTP orchestration**: `MessagesService` extended to call
  `recalculate` and return a `PlanResponseDto` (operations + conflicts).
- **Composition root wiring**: NestJS providers for `PLANNER_REGISTRY`,
  `AGENDA_REPOSITORY`, `CHANGE_HISTORY_REPOSITORY` (Symbol tokens, like the
  existing `LANGUAGE_PORT`).
- **Row ↔ domain mappers** in infrastructure, including explicit `LocalTime`
  serialization.
- **Test strategy**: in-memory **fake** `AgendaRepository` for unit + e2e (no live
  DB); real Prisma + Neon integration validated separately once `DATABASE_URL`
  exists. Rewrite the existing e2e suite for the new response shape.
- **DX**: `.env.example` placeholder, `apps/scheduling/.env` gitignored, Prisma
  schema at `apps/scheduling/prisma/`.

### Out of scope (Phase 4 boundary — hard line)

- **Any persistence write**: `apply(plan)`, mutating `appointments`, writing
  `change_history` records.
- **Propose-and-confirm**: confirmation action, apply-on-confirm.
- **Notifications**, **SSE** (`plan-ready`), real-time transport.
- **Plan staleness / revalidation at apply** (ADR-0004) — the port shape must not
  design it away, but the mechanism is Phase 4.
- **Transaction boundaries / unit-of-work** — Phase 2 is read-only, so no
  transactions yet. The port stays simple but Phase-4-extensible.
- **Real Language NLU** (Phase 3): the FastAPI language adapter already exists and
  is mocked in tests; Phase 2 does not touch it beyond mapping its DTO to `Intent`.

## The 11 decisions

### 1. Repository / port granularity — CONFIRMED

`AgendaRepository` (aggregate-level, returns the assembled `Agenda`) **plus** a
separate `ChangeHistoryRepository`.

**Why.** The domain's `agenda(appointments, workingHours)` factory is the natural
unit of read — the consumer (`recalculate`) needs the whole aggregate, never a
loose appointment. Returning the assembled `Agenda` keeps assembly inside the
adapter, not smeared across the application layer. `change_history` has a
different lifecycle (append-only audit, written on confirm in Phase 4), so it is a
separate port. This honors ADR-0002 (ports owned by the domain, one per external
concern) without over-splitting into `AppointmentRepository` +
`WorkingHoursRepository`, which would push aggregate assembly upward.

```typescript
// application/agenda.repository.ts
export interface AgendaRepository {
  findAgendaForDate(doctorId: string, date: Date): Promise<Agenda | null>;
}
export const AGENDA_REPOSITORY = Symbol('AGENDA_REPOSITORY');
```

### 2. Inbound orchestration shape + `PlanResponseDto` — DEFINED

Flow:

```
POST /messages
  → MessagesService.process(dto)
  → language.interprets(message)            : IntentResponseDto
  → map to domain Intent { kind, params }
  → agendaRepository.findAgendaForDate(DOCTOR_ID, today)  : Agenda
  → recalculate(registry, agenda, intent)   : Plan (domain)
  → mapPlanToDto(plan)                       : PlanResponseDto
```

`PlanResponseDto` — operations + conflicts, with `LocalTime` rendered to `HH:MM`
strings explicitly by the mapper:

```typescript
interface TimeSlotDto { start: string; end: string; }      // "HH:MM"

interface MoveOperationDto {
  type: 'move';
  appointmentId: string;
  patientId: string;
  from: TimeSlotDto;
  to: TimeSlotDto;
}

interface ConflictDto {
  appointmentId: string;
  reason: 'OVERFLOWS_CLOSING';
  proposedSlot: TimeSlotDto;
}

class PlanResponseDto {
  status: 'proposed';            // explicit: Phase 2 never applies
  operations: MoveOperationDto[];
  conflicts: ConflictDto[];
  confidence: number;            // passthrough — see Decision 6
}
```

**LocalTime gotcha (RISK, mitigated here).** `TimeSlot` holds `LocalTime` class
instances. `JSON.stringify` does **not** invoke `toString()` on nested class
instances — it would emit `{ minutesSinceMidnight: N }` or `{}`. The mapper MUST
convert each `LocalTime` to its `HH:MM` string explicitly
(`slot.start.toString()`), never rely on implicit serialization. This is the
single most likely silent bug in Phase 2.

### 3. Composition root wiring — DEFINED

NestJS providers in the messages module, Symbol tokens mirroring `LANGUAGE_PORT`:

```typescript
{ provide: PLANNER_REGISTRY,          useFactory: () => buildPlannerRegistry() },
{ provide: AGENDA_REPOSITORY,         useClass:  PrismaAgendaRepository },
{ provide: CHANGE_HISTORY_REPOSITORY, useClass:  /* deferred — see Decision 8 */ },
```

`buildPlannerRegistry()` is stateless → `useFactory` (evaluated once at module
init). The registry is created at the infrastructure boundary and passed to
`recalculate` as a pure argument; it never leaks into the domain. In tests,
`AGENDA_REPOSITORY` is overridden with the in-memory fake.

### 4. doctorId strategy — DECIDED: hardcoded UUID constant at the composition root

Single-doctor MVP. A `DOCTOR_ID` UUID constant lives at the composition root
(infrastructure), not in env, not in the request.

**Why.** It is not configuration the operator tunes; it is a fixed seed identity
for the MVP. Env would imply deployment-time variance that does not exist.
Request-carried would invite premature multi-tenancy. A named constant documents
"single doctor" honestly and is trivially replaced by auth/JWT when multi-doctor
arrives. Migration seed inserts `working_hours`/`appointments` for this same UUID.

### 5. Date contract — DECIDED: "today" at request time (server clock)

The agenda loads for **today** (server-side `new Date()` at request time). The
`POST /messages` body carries only `{ message }` — unchanged from Phase 0.

**Why.** Matches the product flow (a doctor messaging about *today's* schedule)
and keeps the request contract stable. A date in the body is a YAGNI extension for
Phase 2 and can be added later without breaking the contract (optional field). The
mapper passes the resolved date down so it stays a single, testable seam.

### 6. `confidence` passthrough — DECIDED: pass through into `PlanResponseDto`, do not act on it

`confidence` flows from `IntentResponseDto` straight into `PlanResponseDto`. Phase
2 does **not** branch on it.

**Why.** Acting on low confidence (the clarification path) is Phase 5
(ADR-0005, Scenario 5). Dropping it now would mean re-threading it later through
the whole orchestration. Carrying it as inert data costs nothing and keeps the DTO
forward-compatible. It is an application-layer concern, so it never enters the
domain `Intent`.

### 7. Agenda-not-found behavior — DECIDED: HTTP 422 Unprocessable Entity

`findAgendaForDate` returns `null` (no `working_hours` row for today) →
`MessagesService` raises a `422`.

**Why.** `recalculate` requires a valid `Agenda` with working hours; without them
there is no defined day to reorganize. A `404` is wrong — the *endpoint* exists and
the request was well-formed; it is the *state* that cannot be processed (`422`
Unprocessable Entity is the precise semantic). An empty/stub agenda would be a lie
(it implies an open day with no appointments) and would let `recalculate` produce a
misleading empty Plan. Explicit `422` with a clear message ("no working hours
configured for {date}") is honest and debuggable. The MVP seed guarantees a
working-hours row exists for the happy path.

### 8. change_history Phase 2 scope — DECIDED: schema + port interface only (no adapter)

Phase 2 ships the `change_history` **table** (migration) and the
`ChangeHistoryRepository` **port interface**. It does **not** ship a working
adapter and does **not** wire a live provider that writes.

**Why.** Phase 2 returns a *proposed* Plan and confirms/applies nothing, so there
is genuinely nothing to record — a no-op or unused adapter would be dead code
pretending to be wired. Laying the schema and port now means Phase 4 adds only the
adapter implementation against an already-migrated table and a stable interface,
with zero schema churn. This is the cleanest seam: contract now, implementation
when there is data to write.

```typescript
// application/change-history.repository.ts (Phase 2: interface only)
export interface ChangeHistoryRepository {
  record(entry: ChangeHistoryEntry): Promise<void>;   // implemented in Phase 4
}
export const CHANGE_HISTORY_REPOSITORY = Symbol('CHANGE_HISTORY_REPOSITORY');
```

The `CHANGE_HISTORY_REPOSITORY` provider is registered but bound to a
throw-on-call stub (so an accidental Phase-2 call fails loudly rather than
silently no-ops). Phase 4 swaps the stub for `PrismaChangeHistoryRepository`.

### 9. Migration tooling — CONFIRMED: Prisma Migrate

`prisma migrate dev` locally (generates + applies + regenerates client),
`prisma migrate deploy` for non-interactive environments. `schema.prisma` lives at
`apps/scheduling/prisma/schema.prisma`; migrations under
`apps/scheduling/prisma/migrations/`.

**The exclusion constraint.** Prisma cannot express `EXCLUDE USING gist` in
`schema.prisma`. Workflow: generate the table migration with Prisma, then create a
**custom migration** (`prisma migrate dev --create-only`) and hand-edit its
`migration.sql` to add the raw SQL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    doctor_id WITH =,
    day       WITH =,
    tsrange(
      ('2000-01-01'::date + start_time),
      ('2000-01-01'::date + end_time)
    ) WITH &&
  );
```

This satisfies ADR-0011's mandate that no-double-booking is enforced at the DB, not
only in code. The raw SQL lives inside the Prisma migration so it is versioned and
applied through the same `migrate` pipeline.

### 10. Frontend impact — DEFERRED to Phase 4

The web app is **not** updated in Phase 2. `POST /messages` changes its response
shape (`IntentResponseDto` → `PlanResponseDto`), but the chat UI / proposed-plan
view / confirm action is explicitly a Phase 4 deliverable (BUILD-PLAN Phase 4:
"Frontend: the chat input, the proposed plan, a confirm action").

**Why.** Phase 2's value is the backend seam. Touching the frontend now means
building a plan-display UI without the confirm/notify loop it belongs to — half a
feature. The Phase 0 web app that displays `IntentResponseDto` will show a stale
shape until Phase 4; this is acceptable because the web path is not a Phase 2
acceptance criterion. **Risk noted**: the web app may visibly break against the new
response — flag in tasks, accept as known transient state, do not gold-plate.

### 11. Prisma client placement — DEFINED

- `schema.prisma` → `apps/scheduling/prisma/schema.prisma`.
- Generated client → default `node_modules/@prisma/client` (generated by
  `prisma generate`, gitignored output).
- **Isolation (ADR-0002 invariant):** `PrismaClient` and every generated Prisma
  type are imported **only** inside the infrastructure adapter
  (`messages/infrastructure/prisma/`). A single `PrismaService` (NestJS injectable
  wrapping `PrismaClient` lifecycle) is the one place that touches Prisma. The
  `PrismaAgendaRepository` adapter depends on `PrismaService`, runs queries, and
  hand-maps rows → domain value objects via dedicated mapper functions. **Zero
  `@prisma/*` imports anywhere under `src/domain/`** — enforce by review (and,
  recommended, an import-boundary lint rule).

## Persistence schema

```sql
-- working_hours: one row per doctor/day (single-doctor MVP seed)
CREATE TABLE working_hours (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID NOT NULL,
  day        DATE NOT NULL,
  open_time  TIME NOT NULL,
  close_time TIME NOT NULL,
  UNIQUE (doctor_id, day)
);

CREATE TABLE appointments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL,
  patient_id  UUID NOT NULL,
  day         DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL
);

-- no-double-booking — raw SQL in a custom Prisma migration (btree_gist)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    doctor_id WITH =, day WITH =,
    tsrange(('2000-01-01'::date + start_time),
            ('2000-01-01'::date + end_time)) WITH &&
  );

-- change_history: schema now, writes in Phase 4
CREATE TABLE change_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     UUID NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_message   TEXT NOT NULL,
  intent_kind   VARCHAR(50) NOT NULL,
  intent_params JSONB NOT NULL,
  plan_snapshot JSONB NOT NULL,
  applied       BOOLEAN NOT NULL DEFAULT false
);
```

(`schema.prisma` models these; the `EXCLUDE` constraint is the hand-written raw-SQL
addition per Decision 9.)

## Orchestration flow (read-only)

| Step | Layer | Note |
|------|-------|------|
| Receive `{ message }` | inbound HTTP (controller) | contract unchanged |
| `language.interprets(message)` → `IntentResponseDto` | application → language adapter | existing port, mocked in tests |
| map → domain `Intent { kind, params }` | application | trivial map; `confidence` set aside |
| `findAgendaForDate(DOCTOR_ID, today)` → `Agenda` | application → Prisma adapter | `null` → `422` (Decision 7) |
| `recalculate(registry, agenda, intent)` → `Plan` | domain (pure) | registry injected as value |
| `mapPlanToDto(plan, confidence)` → `PlanResponseDto` | application | explicit `LocalTime` → `HH:MM` |
| respond `200` with proposed plan | inbound HTTP | `status: 'proposed'`; no writes |

## Test strategy

| Layer | Approach |
|-------|----------|
| Domain | already green (106) — untouched |
| `MessagesService` unit | in-memory **fake** `AgendaRepository` + mocked `LanguagePort`; assert mapping, `422` on null agenda, `LocalTime` → `HH:MM`, `confidence` passthrough |
| e2e (`messages.e2e-spec.ts`) | NestJS TestingModule + supertest; override `LANGUAGE_PORT` and `AGENDA_REPOSITORY` with fakes — **no live DB**. Rewrite for `PlanResponseDto`. |
| Prisma adapter integration | separate, run only when `DATABASE_URL` exists (Neon). Validates real queries, mappers, and the `no_double_booking` constraint (insert overlapping rows → expect DB rejection). |

Strict TDD: fake-first. The fake `AgendaRepository` is the unit-test seam that lets
all proposal/spec/design/port/mapper work proceed **without a live DB**; the live
Neon DB is needed only to run migrations + the integration suite.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **ORM leak** — `@prisma/*` types reach `src/domain/` | High (breaks ADR-0002) | Single `PrismaService`; types confined to `infrastructure/prisma/`; review + recommended import-boundary lint rule |
| **LocalTime serialization** — `JSON.stringify` skips `toString()` on nested class instances | High (silent data corruption) | Mapper converts every `LocalTime` to `HH:MM` explicitly; unit-test the DTO shape |
| **Transaction boundaries deferred** — Phase 4 must apply plan + write history atomically | Medium | Port stays simple now but Phase-4-extensible; do not design atomicity away |
| **e2e test breakage** — response shape change + new injectable | Medium | Rewrite e2e for `PlanResponseDto`; fakes for both ports; no DB in e2e |
| **Plan staleness** (ADR-0004) | Low (Phase 2) | Out of scope; port shape must not preclude an etag/version later |
| **Frontend stale shape** (Decision 10) | Low | Accepted transient; web updated in Phase 4 |
| **Exclusion constraint correctness** — `tsrange` over `TIME` casting | Medium | Integration test inserts overlapping appointments and asserts DB rejection |
| **DB DX** — no env, no migration tooling existed | Medium | `.env.example`, gitignored `.env`, documented `prisma migrate dev` workflow |

## Size estimate

**LARGE.** This change spans: Prisma + Neon setup, `schema.prisma`, 2+ migrations
(tables + raw-SQL exclusion constraint + seed), two ports, one Prisma adapter +
mappers, one throw-stub, orchestration rewrite in `MessagesService`, new
`PlanResponseDto` + mapper, composition-root wiring, a fresh in-memory fake, and a
**full e2e rewrite**. Rough estimate **400–600 changed lines** across ~15 files —
likely **over the 400-line single-PR budget**. Recommend the tasks phase forecast
chained/stacked PRs: (1) schema + migrations + DB wiring, (2) ports + adapter +
mappers + fake, (3) orchestration + DTO + e2e rewrite.

## Next step

Run `sdd-spec` and `sdd-design` in parallel (both read this proposal). Spec
captures behavioral requirements (orchestration contract, `422` rule, DTO shape,
no-double-booking acceptance); design captures the adapter/mapper/composition
structure and the Prisma isolation boundary.
