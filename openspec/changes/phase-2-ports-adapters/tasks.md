# Tasks — Phase 2: Ports & Adapters

**Change**: `phase-2-ports-adapters`
**TDD mode**: STRICT (runner: `cd apps/scheduling && pnpm test`)
**Delivery strategy**: `single-pr` (cached) — see Review Workload Forecast below
**Generated**: 2026-06-05

---

## Review Workload Forecast

| Metric | Slice 1 | Slice 2 | Slice 3 | Total |
|--------|---------|---------|---------|-------|
| Estimated changed lines | ~160 | ~170 | ~175 | ~505 |
| File count | 8 | 9 | 8 | 25 |
| 400-line budget risk | — | — | — | **HIGH** |
| Chained PRs recommended | Yes | Yes | Yes | **Yes (3-slice boundary)** |
| Decision needed before apply | **YES** | | | |

**Slice boundaries for chained PRs:**
- PR 1 → tasks S1-1 through S1-7 (DB foundation)
- PR 2 → tasks S2-1 through S2-8 (ports, adapter, mappers, fake)
- PR 3 → tasks S3-1 through S3-8 (DTO, orchestration, wiring, e2e)

**Estimated total: ~505 changed lines across 25 files (net new + edits).**
Exceeds the 400-line budget by ~25%. The proposal explicitly identifies these as 3 independent slices.
`single-pr` requires `size:exception` recorded before apply proceeds.

---

## Slice 1 — DB Foundation

> Prisma setup: deps, schema, PrismaService, migrations (generated + hand-edited EXCLUDE constraint), DX housekeeping.
> All tasks in this slice can proceed WITHOUT a live DATABASE_URL until S1-6 (migration deploy requires Neon).
> Slice is complete when `pnpm test` stays GREEN and `prisma generate` succeeds offline.

---

### S1-1 — Add Prisma dependencies and scripts to `package.json`

**File**: `apps/scheduling/package.json`
**What it creates**: Adds `@prisma/client ^6` to `dependencies`, `prisma ^6` to `devDependencies`.
Adds scripts: `prisma:generate`, `prisma:migrate`, `prisma:deploy`, and `postinstall: prisma generate`.
**Spec**: agenda-persistence § "DB DX & dependencies"
**Driving test**: No test file — structural change. Verify with `pnpm install` (postinstall runs `prisma generate` without error once schema.prisma exists).
**DB required**: No
**Dependency**: none — first task in slice

---

### S1-2 — Create `prisma/schema.prisma` with 3 models

**File**: `apps/scheduling/prisma/schema.prisma`
**What it creates**: Datasource block (`provider=postgresql`, `url=env("DATABASE_URL")`).
Generator block (`prisma-client-js`).
Models: `WorkingHours`, `Appointment`, `ChangeHistory` — exact field types from design §2 (`@db.Uuid`, `@db.Date`, `@db.Time(0)`, `@db.Timestamptz(6)`, `@db.VarChar(50)`, `@db.JsonB`).
`@@unique([doctorId, day])` on WorkingHours.
`@@index([doctorId, day])` on Appointment.
`@@map` snake_case on all three models.
**Spec**: agenda-persistence § "Database schema"
**Driving test**: `prisma validate` (no DB needed). Verified structurally — schema lint pass is the green gate.
**DB required**: No
**Dependency**: S1-1 (prisma devDep must be installed)

---

### S1-3 — Create `.env.example` and verify `.gitignore`

**Files**:
- `apps/scheduling/.env.example` (NEW — committed placeholder)
- `apps/scheduling/.gitignore` (EDIT — add `.env` line if absent)

**What it creates**: `.env.example` with `DATABASE_URL` and `LANGUAGE_URL` placeholders.
`.env` entry added to gitignore so real credentials are never committed.
**Spec**: agenda-persistence § "DB DX"
**Driving test**: None (file content check). Invariant: `git status` must not show `.env` as tracked.
**DB required**: No
**Dependency**: none — can run in parallel with S1-2

---

### S1-4 — Remove docker-compose `postgres` service and `postgres_data` volume

**File**: `docker-compose.yml` (root)
**What it creates**: Deletes the `postgres` service block and `postgres_data` volume declaration.
Neon is remote; the local container misleads `make dev`.
**Spec**: design §9 "Docker / Makefile" (D6 decision)
**Driving test**: None (structural). Verify `docker-compose config` shows no postgres service.
**DB required**: No
**Dependency**: none — can run in parallel with S1-2 and S1-3

---

### S1-5 — Create `PrismaService`

**File**: `apps/scheduling/src/messages/infrastructure/prisma/prisma.service.ts` (NEW)
**What it creates**: `PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy`.
`onModuleInit` calls `this.$connect()`. `onModuleDestroy` calls `this.$disconnect()`.
Imports `@prisma/client` (only file besides adapter and mapper allowed to do so).
**Spec**: agenda-persistence § "Prisma adapter" + design §5
**Driving test**: No dedicated spec — lifecycle is covered by e2e override in Slice 3 (S3-7). The class must compile cleanly.
**DB required**: No (compilation only)
**Dependency**: S1-2 (generated client types must exist — run `prisma generate` after schema)

---

### S1-6 — Run `prisma migrate dev --name init` (generated baseline migration)

**File**: `apps/scheduling/prisma/migrations/<timestamp>_init/migration.sql` (NEW — generated)
**What it creates**: Prisma generates the SQL that creates `working_hours`, `appointments`, `change_history` tables with all indexes and `@@unique`. This is a COMMAND step, not a file-write step.
**Spec**: agenda-persistence § "Migration workflow"
**Driving test**: `prisma migrate status` shows migration applied. TABLE existence confirmed by S1-8 int-spec.
**DB required**: **YES — requires DATABASE_URL pointing to Neon**
**Dependency**: S1-2 (schema must exist), S1-3 (DATABASE_URL must be set in `.env`)

---

### S1-7 — Create and hand-edit `no_double_booking` migration

**File**: `apps/scheduling/prisma/migrations/<timestamp>_no_double_booking/migration.sql` (NEW — hand-edited)
**What it creates**: Run `prisma migrate dev --create-only --name no_double_booking`.
Hand-edit the generated (empty) SQL file with:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "appointments"
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    "doctor_id" WITH =,
    "day" WITH =,
    tsrange(
      ('1970-01-01'::date + "start_time"),
      ('1970-01-01'::date + "end_time"),
      '[)'
    ) WITH &&
  );
```
Then run `prisma migrate deploy` to apply it.
**Spec**: agenda-persistence § "DB-level no-double-booking constraint" + design §2
**Driving test**: The guarded integration test in S2-7 validates the constraint rejects overlapping inserts.
**DB required**: **YES — requires DATABASE_URL** (for `--create-only` command and `migrate deploy`)
**Dependency**: S1-6 (init migration must be applied first so the `appointments` table exists)

---

## Slice 2 — Ports, Adapter, Mappers, Fake

> Pure TypeScript / no DB. All tests run offline. The guarded int-spec (S2-7) self-skips when DATABASE_URL is absent.
> Tasks S2-1 through S2-4 can run in parallel. S2-5, S2-6 depend on S2-1 and S2-3. S2-7 depends on S2-4 and S2-5.

---

### S2-1 — Define `AgendaRepository` port + `AGENDA_REPOSITORY` token

**File**: `apps/scheduling/src/messages/application/agenda.repository.ts` (NEW)
**What it creates**:
```ts
export interface AgendaRepository {
  findAgendaForDate(doctorId: string, date: Date): Promise<Agenda | null>;
}
export const AGENDA_REPOSITORY = Symbol('AGENDA_REPOSITORY');
```
ZERO `@prisma/*` imports. Imports only `Agenda` from `../../domain`.
**Spec**: agenda-persistence § "AgendaRepository port"
**Driving test**: TypeScript compilation is the gate. No runtime spec file needed for the interface itself — the fake spec (S2-3) exercises the contract.
**DB required**: No
**Dependency**: none (domain `Agenda` type already exported from `src/domain/index.ts`)

---

### S2-2 — Define `ChangeHistoryRepository` port + `CHANGE_HISTORY_REPOSITORY` token

**File**: `apps/scheduling/src/messages/application/change-history.repository.ts` (NEW)
**What it creates**: `ChangeHistoryEntry` interface; `ChangeHistoryRepository` interface with `record(entry): Promise<void>`; `CHANGE_HISTORY_REPOSITORY = Symbol(...)`.
ZERO `@prisma/*` imports; pure domain types only.
**Spec**: agenda-persistence § "ChangeHistoryRepository port"
**Driving test**: Compilation gate. The fail-loud stub spec (S2-8) exercises the contract.
**DB required**: No
**Dependency**: none — can run in parallel with S2-1

---

### S2-3 — Write `InMemoryAgendaRepository` (fake) + unit spec

**Files**:
- `apps/scheduling/src/messages/infrastructure/in-memory-agenda.repository.ts` (NEW)
- `apps/scheduling/src/messages/infrastructure/in-memory-agenda.repository.spec.ts` (NEW)

**What it creates**: `InMemoryAgendaRepository implements AgendaRepository`. Stores `Map<string, Agenda>` keyed by `${doctorId}:${date.toISOString().slice(0,10)}`. Returns pre-seeded `Agenda` or `null`.
No DB driver, no NestJS infra imports.

**Driving test (RED first)**:
```
S2-3.1 fake returns pre-seeded Agenda for matching key
S2-3.2 fake returns null for unknown key
S2-3.3 TypeScript accepts InMemoryAgendaRepository as AgendaRepository without cast
```
**Spec**: agenda-persistence § "In-memory fake"
**DB required**: No
**Dependency**: S2-1 (needs `AgendaRepository` interface to implement)

---

### S2-4 — Write `agenda.mapper.ts` + unit spec

**Files**:
- `apps/scheduling/src/messages/infrastructure/prisma/agenda.mapper.ts` (NEW)
- `apps/scheduling/src/messages/infrastructure/prisma/agenda.mapper.spec.ts` (NEW)

**What it creates**: `toLocalTime(t: Date)` using `t.getUTCHours() / t.getUTCMinutes()` (UTC read — no tz trap).
`toAgenda(whRow, apptRows[])` assembling domain `Agenda` from Prisma row shapes.
This is the ONLY file importing both `@prisma/client` AND `../../../domain`.

**Driving test (RED first)**:
```
S2-4.1 toLocalTime(new Date('1970-01-01T09:05:00Z')) → LocalTime { h:9, m:5 }
S2-4.2 toLocalTime reads UTC, not local timezone (timezone-trap regression)
S2-4.3 toAgenda with 2 appointments → Agenda with workingHours + 2 appointments in asc order
S2-4.4 toAgenda with empty appointments array → Agenda with workingHours, appointments.length = 0
```
The spec shapes for `ApptRow` and `WhRow` can use plain objects matching Prisma's generated types — no DB query needed.
**Spec**: agenda-persistence § "PrismaAgendaRepository maps at the boundary" + design §3
**DB required**: No
**Dependency**: S1-2 (Prisma types must exist — run `prisma generate` first)

---

### S2-5 — Write `PrismaAgendaRepository` adapter

**File**: `apps/scheduling/src/messages/infrastructure/prisma/prisma-agenda.repository.ts` (NEW)
**What it creates**: `PrismaAgendaRepository implements AgendaRepository`.
`constructor(private readonly prisma: PrismaService)`.
`findAgendaForDate`: `workingHours.findUnique({where:{doctorId_day:{doctorId,day:date}}})` → null early return.
`appointment.findMany({where:{doctorId,day:date}, orderBy:{startTime:'asc'}})`.
Calls `toAgenda(wh, appts)` from the mapper.
No `@prisma/client` imports in domain; adapter imports only from `infrastructure/prisma/`.
**Spec**: agenda-persistence § "PrismaAgendaRepository maps at the boundary"
**Driving test**: Adapter is tested by the guarded int-spec (S2-7). Its unit construction is trivial; the mapper unit spec (S2-4) covers row→domain logic. No separate offline unit spec needed for the adapter shell.
**DB required**: No for the file itself (compilation); live queries covered by S2-7.
**Dependency**: S2-4 (mapper), S1-5 (PrismaService type), S2-1 (AgendaRepository interface)

---

### S2-6 — Write `FailingChangeHistoryRepository` stub + unit spec

**Files**:
- `apps/scheduling/src/messages/infrastructure/failing-change-history.repository.ts` (NEW)
- `apps/scheduling/src/messages/infrastructure/failing-change-history.repository.spec.ts` (NEW)

**What it creates**: `FailingChangeHistoryRepository implements ChangeHistoryRepository`.
`record(): Promise<void>` throws `new Error('ChangeHistoryRepository.record is not implemented until Phase 4')`.

**Driving test (RED first)**:
```
S2-6.1 calling record() throws an Error referencing Phase 4
```
**Spec**: agenda-persistence § "ChangeHistoryRepository port (Phase 2 — interface only)"
**DB required**: No
**Dependency**: S2-2 (needs `ChangeHistoryRepository` interface)

---

### S2-7 — Write guarded integration spec for `PrismaAgendaRepository`

**File**: `apps/scheduling/src/messages/infrastructure/prisma/prisma-agenda.repository.int-spec.ts` (NEW)
**What it creates**: Integration test file using `const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip`.
Matched by default `.*\.spec\.ts$` regex — self-skips when `DATABASE_URL` absent.
Tests:
```
S2-7.1 findAgendaForDate returns assembled Agenda when working_hours + appointments rows exist
S2-7.2 findAgendaForDate returns null when no working_hours row exists
S2-7.3 findAgendaForDate returns Agenda with empty appointments[] when wh exists but no appts
S2-7.4 INSERT overlapping appointment is rejected by no_double_booking EXCLUDE constraint
S2-7.5 INSERT adjacent (non-overlapping) appointment succeeds
S2-7.6 INSERT overlapping appointment for DIFFERENT doctor succeeds (constraint not triggered)
```
`beforeAll` connects `PrismaService` directly; `afterAll` disconnects + cleans up seeded rows.
The mapper round-trip (times preserved through DB) is validated via S2-7.1.
**Spec**: agenda-persistence § integration test scenarios + design §8
**DB required**: **YES — requires DATABASE_URL (Neon)**. Self-skips gracefully if absent.
**Dependency**: S2-5 (adapter), S2-4 (mapper), S1-7 (no_double_booking migration deployed)

---

### S2-8 — Hexagonal invariant check (automated guard)

**Command**: `rg "@prisma" apps/scheduling/src/domain`
**What it creates**: No file — this is a verification step to run after S2-5.
Result MUST be empty. If any match is found, stop and fix before proceeding to Slice 3.
**Spec**: agenda-persistence § "Isolation constraint"
**DB required**: No
**Dependency**: S2-5 (all @prisma/client importers written — adapter, service, mapper)

---

## Slice 3 — Inbound Orchestration

> DTO + mapper, service rewrite, controller update, module wiring, e2e rewrite.
> All tests run offline (no DATABASE_URL needed). `pnpm test` must stay GREEN throughout.
> Tasks S3-1 and S3-2 can proceed in parallel. S3-3 depends on S3-1 and S3-2. S3-4 depends on S3-1. S3-5 depends on S3-1, S3-2, S3-3.

---

### S3-1 — Create `PlanResponseDto` interfaces

**File**: `apps/scheduling/src/messages/dto/plan-response.dto.ts` (NEW)
**What it creates**: Plain `interface` declarations (no class-validator):
`TimeSlotDto`, `OperationDto`, `ConflictDto`, `PlanResponseDto` — exact shapes from design §4.
`status: 'proposed'` literal. No imports from `@prisma/*` or domain.
**Spec**: interpret-pipeline § "PlanResponseDto"
**Driving test**: TypeScript compilation gate. Shape is exercised by S3-2 mapper spec.
**DB required**: No
**Dependency**: none — can start immediately

---

### S3-2 — Create `plan.mapper.ts` + unit spec (LocalTime serialization gotcha)

**Files**:
- `apps/scheduling/src/messages/dto/plan.mapper.ts` (NEW)
- `apps/scheduling/src/messages/dto/plan.mapper.spec.ts` (NEW)

**What it creates**: `mapPlanToDto(plan: Plan, confidence: number): PlanResponseDto`.
`toSlotDto` calls `slot.start.toString()` and `slot.end.toString()` EXPLICITLY — never `JSON.stringify` on a `LocalTime` instance.
`toOperationDto`, `toConflictDto` helpers.

**Driving test (RED first — this is the high-risk serialization gotcha)**:
```
S3-2.1 operations[0].to.start is the string '14:40' (not a LocalTime instance, not {})
S3-2.2 operations[0].to.end is the string '15:10'
S3-2.3 single-digit minute is zero-padded: LocalTime.of(9,5) → '09:05'
S3-2.4 status is always the string literal 'proposed'
S3-2.5 conflicts[0].proposedSlot.end is a string HH:MM
S3-2.6 confidence passes through unchanged (0.74 → 0.74, not rounded)
S3-2.7 empty operations + conflicts → {status:'proposed', operations:[], conflicts:[], confidence}
```
**Spec**: interpret-pipeline § "time fields are HH:MM strings" + "zero-padding preserved"
**DB required**: No
**Dependency**: S3-1 (PlanResponseDto type), domain `Plan` type already exported

---

### S3-3 — Create `scheduling.constants.ts` (`DOCTOR_ID` and `today()`)

**File**: `apps/scheduling/src/messages/application/scheduling.constants.ts` (NEW)
**What it creates**: `DOCTOR_ID = '00000000-0000-0000-0000-000000000001'` (string constant).
`today(): Date` returning `new Date(Date.UTC(year, month, date))` — UTC midnight, matches `@db.Date`.
**Spec**: design §6 "DOCTOR_ID and today()"
**Driving test**: Lightweight unit test (inline in same file's spec or as part of S3-5 service spec):
```
S3-3.1 today() returns a Date with getUTCHours() === 0 and getUTCMinutes() === 0
S3-3.2 today() returns the current UTC date (not yesterday or tomorrow)
```
Can be added to `messages.service.spec.ts` as a quick import check.
**DB required**: No
**Dependency**: none

---

### S3-4 — Add `PLANNER_REGISTRY` token to service or tokens file

**File**: `apps/scheduling/src/messages/application/messages.service.ts` (EDIT — add token at top)
OR a new `apps/scheduling/src/messages/application/tokens.ts`
**What it creates**: `export const PLANNER_REGISTRY = Symbol('PLANNER_REGISTRY')`.
The service does NOT import `buildPlannerRegistry` — only the token lives here.
**Spec**: design §4 "application/messages.service.ts" + §5 composition root
**Driving test**: Compilation gate; token is exercised by S3-6 (app.module.ts) and S3-5 (service spec).
**DB required**: No
**Dependency**: none — can run in parallel with S3-1 and S3-2

---

### S3-5 — Rewrite `MessagesService` + update unit spec

**Files**:
- `apps/scheduling/src/messages/application/messages.service.ts` (EDIT — full rewrite)
- `apps/scheduling/src/messages/application/messages.service.spec.ts` (EDIT — full rewrite)

**What it creates (service)**:
3-dep constructor: `@Inject(LANGUAGE_PORT)`, `@Inject(AGENDA_REPOSITORY)`, `@Inject(PLANNER_REGISTRY)`.
`process(dto: MessageDto): Promise<PlanResponseDto>`:
1. `language.interprets(dto.message)` → `{ intent, confidence }`
2. Map to domain `Intent { kind, params }`
3. `agendaRepo.findAgendaForDate(DOCTOR_ID, today())`
4. `null` → `throw new UnprocessableEntityException({ error: 'agenda_not_found' })`
5. `recalculate(this.registry, agenda, intent)` → `Plan`
6. `mapPlanToDto(plan, confidence)` → return

**Driving test (RED first — all use fake `AgendaRepository`, mocked `LanguagePort`)**:
```
S3-5.1 happy path: DELAY 15min over 4 appointments → PlanResponseDto with 4 move operations
S3-5.2 operations[0].to.start is string '14:15', not a LocalTime instance
S3-5.3 confidence passes through unchanged (0.97)
S3-5.4 agendaRepo returns null → process() rejects with UnprocessableEntityException (422)
S3-5.5 language throws ServiceUnavailableException → service re-throws it (503 path)
S3-5.6 overflow conflict: one appointment near close → conflicts.length === 1, reason 'OVERFLOWS_CLOSING'
S3-5.7 empty agenda (wh exists, zero appts) → 200, operations:[], conflicts:[]
```
**Spec**: interpret-pipeline § "MessagesService orchestrates message → Plan"
**DB required**: No
**Dependency**: S2-1 (AgendaRepository port), S2-3 (InMemoryAgendaRepository fake), S3-1, S3-2, S3-3, S3-4

---

### S3-6 — Update `app.module.ts` composition root

**File**: `apps/scheduling/src/app.module.ts` (EDIT)
**What it creates**: Adds providers:
- `PrismaService`
- `{ provide: PLANNER_REGISTRY, useFactory: () => buildPlannerRegistry() }`
- `{ provide: AGENDA_REPOSITORY, useClass: PrismaAgendaRepository }`
- `{ provide: CHANGE_HISTORY_REPOSITORY, useClass: FailingChangeHistoryRepository }`

Imports: `PrismaService`, `PrismaAgendaRepository`, `FailingChangeHistoryRepository`, `PLANNER_REGISTRY`, `AGENDA_REPOSITORY`, `CHANGE_HISTORY_REPOSITORY`, `buildPlannerRegistry`.
Keeps existing `LANGUAGE_PORT → HttpLanguageAdapter`.
**Spec**: interpret-pipeline § "wiring at the NestJS module level"
**Driving test**: Module wiring is exercised by the e2e spec (S3-7) — if AppModule boots cleanly in the test override, wiring is correct.
**DB required**: No (e2e overrides `AGENDA_REPOSITORY` with the fake so Prisma is never connected)
**Dependency**: S1-5 (PrismaService), S2-1 (token), S2-2 (token), S2-5 (adapter), S2-6 (stub), S3-4 (PLANNER_REGISTRY token)

---

### S3-7 — Update `messages.controller.ts` return type

**File**: `apps/scheduling/src/messages/messages.controller.ts` (EDIT)
**What it creates**: Changes `create()` return type from `Promise<IntentResponseDto>` to `Promise<PlanResponseDto>`.
Import `PlanResponseDto` from `./dto/plan-response.dto`. Remove `IntentResponseDto` import.
No logic change — controller stays a thin pass-through.
**Spec**: design §1 file tree; interpret-pipeline § response shape
**Driving test**: TypeScript compilation gate; exercised by S3-8 e2e spec.
**DB required**: No
**Dependency**: S3-1 (PlanResponseDto type), S3-5 (service returns PlanResponseDto)

---

### S3-8 — Rewrite `messages.e2e-spec.ts`

**File**: `apps/scheduling/test/messages.e2e-spec.ts` (EDIT — full rewrite)
**What it creates**: Test module bootstrapped with:
```ts
.overrideProvider(LANGUAGE_PORT).useValue({ interprets: jest.fn() })
.overrideProvider(AGENDA_REPOSITORY).useValue(new InMemoryAgendaRepository(seededAgenda))
```
Optional: `.overrideProvider(PrismaService).useValue({})` if connect attempt is observed.

**Driving test (RED first)**:
```
S3-8.1 POST /messages with seeded Agenda + DELAY 15min → 200 PlanResponseDto shape
S3-8.2 response.operations[0].to.start is string '14:15' (not object)
S3-8.3 response.status === 'proposed'
S3-8.4 response.confidence === 0.97 (passed through)
S3-8.5 no AGENDA_REPOSITORY row seeded → POST /messages → 422 { error: 'agenda_not_found' }
S3-8.6 POST /messages with empty message body → 400
S3-8.7 POST /messages with missing message field → 400
S3-8.8 language throws ServiceUnavailableException → 503 { error: 'language_unavailable' }
S3-8.9 OPTIONS /messages preflight → CORS headers present (existing test preserved)
S3-8.10 Module boots without a DATABASE_URL (AGENDA_REPOSITORY is the fake — no DB needed)
```
**Spec**: interpret-pipeline § "Test coverage contract"
**DB required**: No
**Dependency**: S3-5 (service), S3-6 (module), S3-7 (controller), S2-3 (fake)

---

## Dependency Graph (sequential constraints)

```
S1-1 → S1-2 → S1-5 → S2-4 → S2-5 ─┐
S1-2 → S1-6 → S1-7 → S2-7         │
S1-3 (parallel with S1-2, S1-4)   │
S1-4 (parallel)                    │
S2-1 → S2-3                        │
S2-1 → S2-5 ──────────────────────→ S3-6 → S3-8
S2-2 → S2-6 ──────────────────────→ S3-6
S2-4 → S2-5 → S2-7 (DB-guarded)   │
S2-8 (invariant check after S2-5) │
S3-1 → S3-2 ──────────────────────→ S3-5 → S3-7 → S3-8
S3-3 (parallel with S3-1, S3-2) ──→ S3-5
S3-4 (parallel) ──────────────────→ S3-5 → S3-6
```

---

## Task Summary

| ID | File / Action | Type | DB? | Slice |
|----|--------------|------|-----|-------|
| S1-1 | `package.json` — deps + scripts | EDIT | No | 1 | [x] |
| S1-2 | `prisma/schema.prisma` — 3 models | NEW | No | 1 | [x] |
| S1-3 | `.env.example` + `.gitignore` | NEW/EDIT | No | 1 | [x] |
| S1-4 | `docker-compose.yml` — drop postgres | EDIT | No | 1 | [x] |
| S1-5 | `infrastructure/prisma/prisma.service.ts` | NEW | No | 1 | [x] |
| S1-6 | `prisma migrate dev --name init` (command) | CMD | **Yes** | 1 | [x] hand-authored offline |
| S1-7 | `_no_double_booking/migration.sql` — hand-edit + deploy | NEW+CMD | **Yes** | 1 | [x] hand-authored offline |
| S2-1 | `application/agenda.repository.ts` | NEW | No | 2 | [x] |
| S2-2 | `application/change-history.repository.ts` | NEW | No | 2 | [x] |
| S2-3 | `infrastructure/in-memory-agenda.repository.ts` + spec | NEW | No | 2 | [x] |
| S2-4 | `infrastructure/prisma/agenda.mapper.ts` + spec | NEW | No | 2 | [x] |
| S2-5 | `infrastructure/prisma/prisma-agenda.repository.ts` | NEW | No | 2 | [x] |
| S2-6 | `infrastructure/failing-change-history.repository.ts` + spec | NEW | No | 2 | [x] |
| S2-7 | `prisma-agenda.repository.int-spec.ts` (guarded) | NEW | **Yes (self-skip)** | 2 | [x] self-skips offline |
| S2-8 | `rg "@prisma" src/domain` invariant check | VERIFY | No | 2 | [x] CLEAN |
| S3-1 | `dto/plan-response.dto.ts` | NEW | No | 3 | [x] |
| S3-2 | `dto/plan.mapper.ts` + spec | NEW | No | 3 | [x] |
| S3-3 | `application/scheduling.constants.ts` | NEW | No | 3 | [x] |
| S3-4 | `PLANNER_REGISTRY` token (in service or tokens.ts) | EDIT/NEW | No | 3 | [x] |
| S3-5 | `application/messages.service.ts` + spec (rewrite) | EDIT | No | 3 | [x] |
| S3-6 | `app.module.ts` — composition root wiring | EDIT | No | 3 | [x] |
| S3-7 | `messages.controller.ts` — return type | EDIT | No | 3 | [x] |
| S3-8 | `test/messages.e2e-spec.ts` (rewrite) | EDIT | No | 3 | [x] |

**Total**: 23 tasks (2 command steps, 21 file operations)

---

## Risks

1. **LocalTime serialization (HIGH)**: `plan.mapper.spec.ts` (S3-2) is the primary guard. Task S3-2 is marked high-priority — write the failing test first that asserts string output, then implement.
2. **Prisma TIME→Date UTC read (MED)**: `agenda.mapper.spec.ts` (S2-4) guards this with an explicit UTC-read regression test. If Prisma ever changes `TIME` serialization, this catches it.
3. **e2e accidentally connecting to DB (MED)**: Override `AGENDA_REPOSITORY` with the fake in S3-8 removes the Prisma query path. Add `overrideProvider(PrismaService).useValue({})` if `$connect` is logged during e2e.
4. **tsrange correctness (MED)**: Only the guarded int-spec (S2-7) validates the EXCLUDE constraint rejects overlaps. If the user never wires Neon, this remains unverified at the unit/e2e level — flagged.
5. **single-pr budget overage**: ~505 lines exceeds 400-line budget. `size:exception` must be recorded before apply proceeds if `single-pr` delivery strategy is kept. Alternatively, the orchestrator may chain the 3 natural slices.
6. **S1-6 / S1-7 are blocking gates**: Migrations require DATABASE_URL (Neon). The rest of Phase 2 can be fully developed and tested offline; only these two command steps and S2-7 need a live DB.
