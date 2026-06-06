# agenda-persistence Specification

## Purpose

Define what must be true after Phase 2 introduces the persistence port and its
Postgres adapter: a pure `AgendaRepository` port that the domain calls to load an
`Agenda`, a Prisma-backed adapter that satisfies it, and the DB-level constraint
that prevents double-booking. The domain layer acquires zero knowledge of Prisma or
SQL. An in-memory fake satisfies the same port so the application layer can be fully
tested without a live database.

This spec covers NEW capability introduced in Phase 2. It does not repeat Phase 1
domain invariants (see `openspec/specs/scheduling-domain/spec.md`).

---

## On-disk structure (additions)

```
apps/scheduling/
  prisma/
    schema.prisma                          # Prisma data model
    migrations/
      <timestamp>_init/migration.sql       # working_hours + appointments tables
      <timestamp>_no_double_booking/       # EXCLUDE USING gist constraint (hand-edited)
        migration.sql
      <timestamp>_change_history/
        migration.sql                      # change_history table

  src/
    messages/
      infrastructure/
        prisma/
          prisma.service.ts                # NestJS PrismaService (singleton)
          prisma-agenda.repository.ts      # PrismaAgendaRepository (adapter)
          prisma-agenda.repository.int-spec.ts # Integration tests (requires DATABASE_URL)
          agenda.mapper.ts                 # Row↔domain mapping (no mappers subdir)
          agenda.mapper.spec.ts            # Mapper unit tests
        in-memory-agenda.repository.ts     # In-memory fake for unit + e2e tests
        failing-change-history.repository.ts # Fail-loud stub (Phase 4 writes)

  .env.example                             # DATABASE_URL placeholder (committed)
  .env                                     # gitignored; user-provisioned Neon URL
```

---

## Database schema

### Requirement: working_hours table

The `working_hours` table MUST have the following columns:

| Column       | Type                 | Constraints                     |
|--------------|----------------------|---------------------------------|
| `id`         | UUID                 | PRIMARY KEY, default gen_random_uuid() |
| `doctor_id`  | UUID                 | NOT NULL                        |
| `day`        | DATE                 | NOT NULL                        |
| `open_time`  | TIME WITHOUT TZ      | NOT NULL                        |
| `close_time` | TIME WITHOUT TZ      | NOT NULL                        |

A `UNIQUE(doctor_id, day)` constraint MUST be present so each doctor has at most
one working-hours record per day.

### Requirement: appointments table

The `appointments` table MUST have the following columns:

| Column       | Type                 | Constraints                     |
|--------------|----------------------|---------------------------------|
| `id`         | UUID                 | PRIMARY KEY, default gen_random_uuid() |
| `doctor_id`  | UUID                 | NOT NULL                        |
| `patient_id` | UUID                 | NOT NULL                        |
| `day`        | DATE                 | NOT NULL                        |
| `start_time` | TIME WITHOUT TZ      | NOT NULL                        |
| `end_time`   | TIME WITHOUT TZ      | NOT NULL                        |

### Requirement: DB-level no-double-booking constraint

An `EXCLUDE USING gist` constraint named `no_double_booking` MUST be present on
the `appointments` table. It MUST use `btree_gist` (requires the `btree_gist`
Postgres extension) and reject any two rows that share the same `doctor_id` on
the same `day` with overlapping time ranges.

The constraint is expressed using a `tsrange` computed from `(day + start_time)`
to `(day + end_time)`, with `&&` as the overlap operator for the range column and
`=` for the `doctor_id` column.

This constraint MUST be added via a hand-edited raw SQL migration created with
`prisma migrate dev --create-only`. Prisma's `schema.prisma` DSL does NOT express
exclusion constraints natively.

#### Scenario: inserting a non-overlapping appointment succeeds

- GIVEN the `appointments` table contains one row for doctor `d-1` on `2024-03-15`
  with `start_time = 14:00` and `end_time = 14:30`
- WHEN a second row is inserted for doctor `d-1` on `2024-03-15`
  with `start_time = 14:30` and `end_time = 15:00` (adjacent, not overlapping)
- THEN the INSERT succeeds
- AND the table contains two rows for that doctor on that day

#### Scenario: inserting an overlapping appointment is rejected by the DB

- GIVEN the `appointments` table contains one row for doctor `d-1` on `2024-03-15`
  with `start_time = 14:00` and `end_time = 14:30`
- WHEN a second row is inserted for doctor `d-1` on `2024-03-15`
  with `start_time = 14:15` and `end_time = 14:45` (overlaps the existing row)
- THEN the INSERT fails with a Postgres exclusion-constraint violation
- AND no new row is committed to the table

#### Scenario: overlapping appointments for DIFFERENT doctors are allowed

- GIVEN the `appointments` table contains one row for doctor `d-1` on `2024-03-15`
  with `start_time = 14:00` and `end_time = 14:30`
- WHEN a row is inserted for doctor `d-2` on `2024-03-15`
  with `start_time = 14:00` and `end_time = 14:30`
- THEN the INSERT succeeds
- AND the constraint is not triggered

### Requirement: change_history table (schema only — Phase 2)

The `change_history` table MUST be created by a Phase 2 migration with the
following columns:

| Column         | Type         | Constraints                                  |
|----------------|--------------|----------------------------------------------|
| `id`           | UUID         | PRIMARY KEY, default gen_random_uuid()       |
| `doctor_id`    | UUID         | NOT NULL                                     |
| `occurred_at`  | TIMESTAMPTZ  | NOT NULL                                     |
| `raw_message`  | TEXT         | NOT NULL                                     |
| `intent_kind`  | TEXT         | NOT NULL                                     |
| `intent_params`| JSONB        | NOT NULL                                     |
| `plan_snapshot`| JSONB        | NOT NULL                                     |
| `applied`      | BOOLEAN      | NOT NULL, default FALSE                      |

**Phase 2 scope**: schema and migration only. No adapter is written. No data is
written to this table in Phase 2. The `ChangeHistoryRepository` port is defined
(see below) but its provider is bound to a fail-loud stub.

---

## Port contracts

### Requirement: AgendaRepository port

`AgendaRepository` MUST be a TypeScript interface (not a class) located in
`src/domain/` (or adjacent port directory) containing a single method:

```typescript
interface AgendaRepository {
  findAgendaForDate(doctorId: string, date: Date): Promise<Agenda | null>;
}
```

- `findAgendaForDate` MUST return an assembled `Agenda` domain value object when
  a working-hours record exists for the given doctor and date AND at least one
  appointment row exists for that doctor on that date.
- It MUST return `null` when no working-hours record is found for the given
  doctor and date (regardless of appointment rows).
- The return type MUST be `Agenda | null` (not `Agenda | undefined`).
- ZERO `@prisma/*` imports are permitted in the interface file or anywhere under
  `src/domain/`.

#### Scenario: repository returns assembled Agenda when data exists

- GIVEN working-hours `{ open: 09:00, close: 17:00 }` exists for doctor `d-1` on `2024-03-15`
- AND two appointments exist for doctor `d-1` on `2024-03-15`
  (`14:00–14:30` and `14:30–15:00`)
- WHEN `findAgendaForDate('d-1', new Date('2024-03-15'))` is called
- THEN the result is an `Agenda` with `workingHours.open = 09:00`,
  `workingHours.close = 17:00`, and `appointments.length = 2`
- AND the appointments are ordered by `slot.start` ascending

#### Scenario: repository returns null when no working-hours record exists

- GIVEN no working-hours record exists for doctor `d-1` on `2024-03-15`
- WHEN `findAgendaForDate('d-1', new Date('2024-03-15'))` is called
- THEN the result is `null`

#### Scenario: repository returns Agenda with empty appointments list when
working hours exist but no appointments are booked

- GIVEN working-hours `{ open: 09:00, close: 17:00 }` exists for doctor `d-1` on `2024-03-15`
- AND no appointment rows exist for doctor `d-1` on `2024-03-15`
- WHEN `findAgendaForDate('d-1', new Date('2024-03-15'))` is called
- THEN the result is an `Agenda` with `workingHours.open = 09:00`
- AND `appointments` is an empty array (length 0)

### Requirement: ChangeHistoryRepository port (Phase 2 — interface only)

`ChangeHistoryRepository` MUST be a TypeScript interface located in `src/domain/`
(or adjacent port directory). Its exact method signatures are defined in Phase 2
as a placeholder that Phase 4 will implement. The interface MUST exist so the
composition root can bind a stub.

Phase 2 MUST NOT implement any adapter for this port. The provider MUST be bound
to a stub that throws a descriptive error when any method is called (fail-loud, not
silent). The error message MUST indicate that `ChangeHistoryRepository` writes are
not implemented until Phase 4.

#### Scenario: stub throws on any call

- GIVEN the composition root provides the `ChangeHistoryRepository` fail-loud stub
- WHEN any method on the stub is called
- THEN an `Error` is thrown
- AND the error message references Phase 4 as the implementation boundary

---

## Prisma adapter

### Requirement: PrismaAgendaRepository maps at the boundary

`PrismaAgendaRepository` MUST implement the `AgendaRepository` port. It MUST:

- Use `PrismaService` (singleton) to issue queries; it MUST NOT instantiate
  `PrismaClient` directly.
- Query `working_hours` by `doctor_id` and `day`, then query `appointments` by
  `doctor_id` and `day` in a single logical load. Both queries are read-only
  (`findFirst` / `findMany`).
- Hydrate domain value objects (`LocalTime`, `TimeSlot`, `Appointment`,
  `WorkingHours`, `Agenda`) by calling dedicated mapper functions at the adapter
  boundary.
- ZERO `@prisma/*` imports anywhere in `src/domain/`. All Prisma types are
  confined to files under `src/messages/infrastructure/prisma/`.

The mappers MUST convert Prisma `Date` (TIME columns) to `LocalTime` using the
hours and minutes of the value as returned by the database driver. They MUST NOT
use string parsing as a substitute for proper field extraction.

#### Scenario: adapter hydrates domain objects correctly from DB rows

- GIVEN the live DB contains working-hours `09:00–17:00` and four appointments
  for doctor `d-1` on `2024-03-15`
- WHEN `PrismaAgendaRepository.findAgendaForDate('d-1', new Date('2024-03-15'))` is called
- THEN the returned `Agenda` contains `workingHours.open.toString() = '09:00'`
  and `workingHours.close.toString() = '17:00'`
- AND `appointments.length = 4`
- AND each appointment's `slot.start` and `slot.end` are correct `LocalTime` instances

#### Scenario: adapter returns null when working-hours row is absent

- GIVEN the live DB has no working-hours row for doctor `d-1` on `2024-03-15`
- WHEN `PrismaAgendaRepository.findAgendaForDate('d-1', new Date('2024-03-15'))` is called
- THEN the result is `null`

---

## In-memory fake

### Requirement: InMemoryAgendaRepository satisfies the port contract

`InMemoryAgendaRepository` MUST implement the `AgendaRepository` port. It MUST:

- Store pre-seeded `Agenda` instances keyed by `(doctorId, date string)`.
- Return the pre-seeded `Agenda` when a matching key is found.
- Return `null` when no matching key is found.
- NOT depend on any database driver, Prisma, or NestJS infrastructure module.

The fake is the primary test double for `MessagesService` unit tests and for
NestJS e2e tests. No live DB or HTTP call is made during those test runs.

#### Scenario: fake returns pre-seeded Agenda

- GIVEN `InMemoryAgendaRepository` is seeded with an `Agenda` for doctor `d-1`
  on `2024-03-15`
- WHEN `findAgendaForDate('d-1', new Date('2024-03-15'))` is called
- THEN the pre-seeded `Agenda` is returned

#### Scenario: fake returns null for unknown key

- GIVEN `InMemoryAgendaRepository` has no entry for doctor `d-1` on `2024-03-15`
- WHEN `findAgendaForDate('d-1', new Date('2024-03-15'))` is called
- THEN the result is `null`

#### Scenario: fake satisfies the same type as the real adapter

- GIVEN `InMemoryAgendaRepository implements AgendaRepository` is declared
- THEN the TypeScript compiler MUST accept it as a valid `AgendaRepository`
  without casts

---

## Isolation constraint

All files under `apps/scheduling/src/domain/` MUST remain free of imports from
`@prisma/client`, `pg`, `@nestjs/*`, or any HTTP/database adapter package.
`PrismaAgendaRepository`, `PrismaService`, and all mapper files live exclusively
under `src/messages/infrastructure/`. The `AgendaRepository` and
`ChangeHistoryRepository` interfaces may be placed at `src/domain/ports/` or
directly in the domain module — they MUST NOT contain infrastructure types.

---

## Deferred (explicit out-of-scope)

| Item                                         | Deferred to |
|----------------------------------------------|-------------|
| Any write to `change_history`                | Phase 4     |
| Any write to `appointments` (apply plan)     | Phase 4     |
| `ChangeHistoryRepository` adapter            | Phase 4     |
| Transaction / unit-of-work wrapping          | Phase 4     |
| Plan staleness / re-validation               | Phase 4     |
| Retry / connection-pool configuration        | Phase 4     |

---

## Test runner notes

| Requirement                         | Test type             | Requires live DB |
|-------------------------------------|-----------------------|------------------|
| Port contract (fake)                | Jest unit             | No               |
| Fail-loud stub throws               | Jest unit             | No               |
| PrismaAgendaRepository adapter      | Jest integration      | Yes (DATABASE_URL)|
| DB-level no-double-booking          | Jest integration (raw SQL) | Yes          |

Integration tests MUST be guarded by a `DATABASE_URL` environment check and skipped
gracefully when the variable is absent.

```
cd apps/scheduling && pnpm test              # unit only (no DATABASE_URL needed)
cd apps/scheduling && DATABASE_URL=... pnpm test
```
