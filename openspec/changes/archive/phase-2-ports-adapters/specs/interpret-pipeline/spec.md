# interpret-pipeline — Phase 2 Delta Specification

## Purpose

Define the DELTA to the existing `interpret-pipeline` capability after Phase 2
wires inbound HTTP orchestration to the scheduling domain. The `POST /messages`
endpoint no longer proxies a raw intent: it now loads the doctor's `Agenda`,
runs `recalculate`, and returns a PROPOSED Plan in a typed `PlanResponseDto`.

Read this spec alongside `openspec/specs/interpret-pipeline/spec.md` (the base
contract). Requirements from the base spec that are unchanged are NOT repeated here.
Only additions, replacements, and new failure modes are documented below.

---

## What changes at this boundary

| Concern               | Phase 0–1 behaviour                           | Phase 2 behaviour (this spec)                   |
|-----------------------|-----------------------------------------------|-------------------------------------------------|
| Response shape        | Raw `{ intent, confidence }` proxy            | `{ status, operations[], conflicts[], confidence }` |
| Agenda loading        | None                                          | `AgendaRepository.findAgendaForDate` called on every request |
| Doctor identity       | N/A                                           | Hardcoded UUID constant at composition root     |
| Request date          | N/A                                           | Server clock (`new Date()`) — request body stays `{ message }` |
| Agenda not found      | N/A                                           | HTTP 422 Unprocessable Entity                   |
| confidence            | Proxied unchanged                             | Passed through into `PlanResponseDto` unchanged |
| Language downstream   | Proxied unchanged                             | Still called; result mapped to domain `Intent`  |
| Frontend rendering    | Renders `intent` field                        | May visibly break (transient; Phase 4 fixes UI) |

---

## Data shapes

### Requirement: PlanResponseDto

`PlanResponseDto` MUST be the shape returned by `POST /messages` on success:

```typescript
interface TimeSlotDto {
  start: string;  // HH:MM
  end: string;    // HH:MM
}

interface PlanOperationDto {
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

interface PlanResponseDto {
  status: 'proposed';
  operations: PlanOperationDto[];
  conflicts: ConflictDto[];
  confidence: number;
}
```

`status` MUST always be the string literal `'proposed'` in Phase 2. The field
exists to allow Phase 4 to introduce `'applied'` and `'confirmed'` without
breaking the envelope shape.

`time` fields (`start`, `end`) MUST be serialized as `HH:MM` strings. `LocalTime`
instances MUST be explicitly converted via `LocalTime.toString()` before being
placed in the DTO. JSON.stringify does NOT call `toString()` on nested class
instances — silent-bug risk if conversion is omitted.

#### Scenario: time fields are HH:MM strings, not objects

- GIVEN `recalculate` returns a `Plan` where `operations[0].to.start = LocalTime.of(14, 40)`
- WHEN `mapPlanToDto` converts the plan to `PlanResponseDto`
- THEN `dto.operations[0].to.start` equals the string `'14:40'`
- AND `dto.operations[0].to.end` equals the string `'15:10'`
- AND neither field is a `LocalTime` instance or a plain object

#### Scenario: zero-padding is preserved in serialized times

- GIVEN an operation has `from.start = LocalTime.of(9, 5)`
- WHEN `mapPlanToDto` converts it
- THEN `dto.operations[0].from.start` equals `'09:05'`

---

## Orchestration flow

### Requirement: MessagesService orchestrates message → Plan

`MessagesService.handleMessage(body: { message: string }): Promise<PlanResponseDto>`
MUST execute the following steps in order on every request:

1. Call `language.interprets(body.message)` to get `{ intent: { kind, params }, confidence }`.
2. Map the language response to a domain `Intent { kind, params }` value.
3. Call `agendaRepository.findAgendaForDate(DOCTOR_ID, todayDate)` where
   `DOCTOR_ID` is the hardcoded UUID constant and `todayDate` is the server
   clock date at request time.
4. If the result is `null`, throw a typed exception that results in HTTP 422.
5. Call `recalculate(plannerRegistry, agenda, intent)` to produce a `Plan`.
6. Map the `Plan` to `PlanResponseDto` with explicit `LocalTime → HH:MM` conversion.
7. Return the DTO.

No writes are performed in any step. The `Agenda` loaded in step 3 is read-only.

#### Scenario: happy-path DELAY message over a persisted Agenda yields a proposed Plan

- GIVEN working-hours `09:00–17:00` exists for the hardcoded doctor on today's date
- AND four appointments exist:
  - `appt-1` `14:00–14:30` (patient `p-1`)
  - `appt-2` `14:30–15:00` (patient `p-2`)
  - `appt-3` `15:00–15:30` (patient `p-3`)
  - `appt-4` `15:30–16:00` (patient `p-4`)
- AND `language.interprets` returns `{ intent: { kind: 'DELAY', params: { minutes: 15 } }, confidence: 0.97 }`
- WHEN `POST /messages` receives `{ "message": "Voy a llegar 15 minutos tarde" }`
- THEN the HTTP response status is 200
- AND the response body is:
  ```json
  {
    "status": "proposed",
    "operations": [
      { "type": "move", "appointmentId": "appt-1", "patientId": "p-1",
        "from": { "start": "14:00", "end": "14:30" },
        "to":   { "start": "14:15", "end": "14:45" } },
      { "type": "move", "appointmentId": "appt-2", "patientId": "p-2",
        "from": { "start": "14:30", "end": "15:00" },
        "to":   { "start": "14:45", "end": "15:15" } },
      { "type": "move", "appointmentId": "appt-3", "patientId": "p-3",
        "from": { "start": "15:00", "end": "15:30" },
        "to":   { "start": "15:15", "end": "15:45" } },
      { "type": "move", "appointmentId": "appt-4", "patientId": "p-4",
        "from": { "start": "15:30", "end": "16:00" },
        "to":   { "start": "15:45", "end": "16:15" } }
    ],
    "conflicts": [],
    "confidence": 0.97
  }
  ```

#### Scenario: DELAY with overflow conflict included in response

- GIVEN working-hours `09:00–17:00` for the hardcoded doctor on today's date
- AND one appointment exists: `appt-5` `16:40–17:00` (patient `p-5`)
- AND `language.interprets` returns `{ intent: { kind: 'DELAY', params: { minutes: 30 } }, confidence: 1.0 }`
- WHEN `POST /messages` receives any valid message
- THEN the HTTP response status is 200
- AND `response.operations[0].to.start` equals `'17:10'`
- AND `response.conflicts.length` equals `1`
- AND `response.conflicts[0].appointmentId` equals `'appt-5'`
- AND `response.conflicts[0].reason` equals `'OVERFLOWS_CLOSING'`
- AND `response.conflicts[0].proposedSlot.end` equals `'17:30'`

#### Scenario: confidence passes through unchanged

- GIVEN `language.interprets` returns `confidence: 0.74`
- WHEN `POST /messages` is handled successfully
- THEN `response.confidence` equals `0.74`
- AND the value is not rounded, clamped, or modified

---

### Requirement: Agenda-not-found returns HTTP 422

When `agendaRepository.findAgendaForDate` returns `null` for the hardcoded doctor
on today's date, `POST /messages` MUST return HTTP 422 Unprocessable Entity. It
MUST NOT return 404, 500, or an empty `PlanResponseDto`.

The response body at 422 MUST contain a machine-readable error code. The exact
shape is an implementation choice, but MUST be consistent and non-empty.

#### Scenario: no Agenda for today returns 422

- GIVEN no working-hours record exists for the hardcoded doctor on today's date
- WHEN `POST /messages` receives `{ "message": "Voy a llegar tarde" }`
- THEN the HTTP response status is 422
- AND the response body contains an error indicator (e.g., `{ "error": "agenda_not_found" }`)
- AND the response is NOT 200, 404, or 500

---

### Requirement: language port contract unchanged at the HTTP boundary

The `POST /messages` request body shape MUST remain `{ "message": string }`.
No new fields are added to the request in Phase 2.

`scheduling` MUST still call `language POST /interpret` with `{ "message": string }`
and read `{ intent: { kind, params }, confidence }` from the response.
This envelope is stable through Phase 3 (ADR-0005).

#### Scenario: request body is still { message } only

- GIVEN `POST /messages` is called with `{ "message": "some text" }`
- THEN the request is accepted without error
- AND no additional fields are required in the body

#### Scenario: language service errors still return structured error

- GIVEN `language` is NOT running or unreachable
- WHEN `POST /messages` receives a valid request
- THEN `scheduling` responds with HTTP 503
- AND the response body is `{ "error": "language_unavailable" }`
  (unchanged from Phase 0 base spec)

---

## Composition root

### Requirement: wiring at the NestJS module level

The NestJS composition root (`AppModule` or `MessagesModule`) MUST wire:

- `AGENDA_REPOSITORY` token → `PrismaAgendaRepository` (`useClass`)
- `CHANGE_HISTORY_REPOSITORY` token → fail-loud stub (`useValue` or `useClass`)
- `PLANNER_REGISTRY` token → result of `buildPlannerRegistry()` (`useFactory`)
- `LANGUAGE_PORT` token → existing language HTTP adapter (unchanged from Phase 1)
- `DOCTOR_ID` constant → hardcoded UUID string (`useValue`); NOT from env, NOT
  from the request

No constructor or method in the domain or application layer may directly call
`new PrismaClient()` or reference `PrismaService` — only `PrismaAgendaRepository`
holds the dependency.

#### Scenario: application boots without a DATABASE_URL in tests

- GIVEN the NestJS test module overrides `AGENDA_REPOSITORY` with
  `InMemoryAgendaRepository`
- WHEN the NestJS application module is initialized in the test context
- THEN the app starts without attempting to connect to a database
- AND `MessagesService` runs entirely against the in-memory fake

---

## Test coverage contract

| Requirement                                        | Test type   | Uses live DB |
|----------------------------------------------------|-------------|--------------|
| PlanResponseDto time fields are HH:MM strings      | Jest unit   | No           |
| Zero-padding preserved                             | Jest unit   | No           |
| Happy-path DELAY → proposed Plan (15 min example)  | Jest unit + e2e | No (fake) |
| Overflow conflict appears in response              | Jest unit   | No (fake)    |
| confidence passes through unchanged                | Jest unit   | No (fake)    |
| Agenda-not-found → HTTP 422                        | Jest e2e    | No (fake)    |
| Request body stays { message }                     | Jest e2e    | No (fake)    |
| language service down → HTTP 503                   | Jest unit   | No           |
| Composition root wires correctly                   | Jest e2e    | No (fake override) |

All tests that target `MessagesService` MUST use `InMemoryAgendaRepository` and a
mocked `LanguagePort`. No live network or database calls are permitted in unit or
e2e test runs.

---

## Deferred (explicit out-of-scope)

| Item                                                     | Deferred to |
|----------------------------------------------------------|-------------|
| Writing `change_history` rows on each request            | Phase 4     |
| `apply(plan)` — persisting proposed plan operations      | Phase 4     |
| Plan confirmation / staleness / re-validation            | Phase 4     |
| Frontend rendering of `PlanResponseDto`                  | Phase 4     |
| Confidence-based clarification flow                      | Phase 5     |
| Real NLU replacing the language stub                     | Phase 3     |
| SSE / push notifications                                 | Phase 4     |
