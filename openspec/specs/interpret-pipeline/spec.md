# interpret-pipeline Specification

## Purpose

End-to-end message round-trip across all three apps: a doctor's free-text message
typed in the web UI travels to `scheduling` (NestJS BFF) via REST, which forwards
it to `language` (FastAPI) via a synchronous `POST /interpret`, receives a
hard-coded `DELAY` intent, and returns it to the web UI for rendering.

No domain logic, no real NLU, no database. Contracts only.

## Agreed contract (stable from Phase 0 through Phase 3)

The intent is **data** in the ADR-0005 `{ kind, params }` shape. `language` MUST
return, and `scheduling` MUST forward to its domain layer, this body:

```json
{
  "intent": { "kind": "DELAY", "params": { "minutes": 15 } },
  "confidence": 1.0
}
```

- `intent.kind` is UPPERCASE (ADR-0005); `params` is an open, intent-specific object.
- `confidence` is present from Phase 0 (a hard-coded `1.0` for the stub); Phase 3
  replaces the stub body with a real LLM result without changing this envelope.
- The `intent` (`{ kind, params }`) and `confidence` envelope MUST NOT be renamed
  or restructured — Phase 1 planners key off `intent.kind` and read `intent.params`.

**Phase 2 change**: `scheduling POST /messages` no longer proxies the raw language
response to the caller. Instead, it loads an `Agenda`, runs `recalculate`, and
returns a typed `PlanResponseDto` with operations, conflicts, and the confidence
value passed through unchanged. The language contract (`{ intent, confidence }`) is
stable; the `scheduling` boundary response shape changed to `{ status, operations[], conflicts[], confidence }`.

### Endpoints

- **language** — `POST /interpret`, request `{ "message": string }`.
- **scheduling** (BFF) — `POST /messages`, request `{ "message": string }`.

---

## Requirements

---

## Data shapes (Phase 2)

### Requirement: PlanResponseDto

`PlanResponseDto` MUST be the shape returned by `POST /messages` on success (Phase 2+):

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
instances — this is a silent-bug risk if conversion is omitted.

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

### Requirement: Web-to-Scheduling REST submission

The web app MUST expose a text input and a submit control that POST the doctor's
message to `scheduling POST /messages`. On a successful response it MUST render the
returned intent structure in the UI. The web app MUST NOT call `language`
directly — `scheduling` is the only backend for the frontend (ADR-0007 BFF rule).

#### Scenario: Happy-path round-trip renders a proposed Plan (Phase 2+)

- GIVEN the web app is running and `scheduling` is reachable at its configured URL
- AND a working-hours record exists for the hardcoded doctor on today's date
- WHEN the doctor types any non-empty message and submits
- THEN the web app POSTs `{ "message": "<text>" }` to `scheduling POST /messages`
- AND the UI renders the returned `PlanResponseDto` — `{ status: 'proposed', operations[], conflicts[], confidence }`
- AND `operations[0].type` is `'move'` and times are formatted as `'HH:MM'` strings

#### Scenario: Empty message is not submitted

- GIVEN the web app is running
- WHEN the doctor attempts to submit with an empty message field
- THEN no HTTP request is made to `scheduling`
- AND the UI provides feedback that a message is required

---

### Requirement: Scheduling orchestrates message → Plan

`scheduling` MUST expose `POST /messages` accepting `{ "message": string }`.
It MUST forward the message to `language POST /interpret` via synchronous HTTP+JSON
to obtain the intent, then use that intent to calculate a proposed plan using the
scheduling domain (Phase 1) and return a typed `PlanResponseDto` to the caller.

The language contract (`{ intent: { kind, params }, confidence }`) is **internal** —
not exposed to the caller. The caller receives the calculated plan and conflicts.

#### Scenario: happy-path DELAY message over a persisted Agenda yields a proposed Plan (Phase 2+)

- GIVEN working-hours `09:00–17:00` exists for the hardcoded doctor on today's date
- AND four appointments exist for that doctor on today's date
- AND `language.interprets` returns `{ intent: { kind: 'DELAY', params: { minutes: 15 } }, confidence: 0.97 }`
- WHEN `scheduling POST /messages` receives `{ "message": "Voy a llegar 15 minutos tarde" }`
- THEN the HTTP response status is 200
- AND the response body is a `PlanResponseDto` with:
  - `status: 'proposed'`
  - `operations[]` containing move operations with times as `'HH:MM'` strings
  - `conflicts[]` (empty if no conflicts)
  - `confidence: 0.97` (passed through from language unchanged)

#### Scenario: confidence passes through unchanged

- GIVEN `language.interprets` returns `confidence: 0.74`
- WHEN `scheduling POST /messages` is handled successfully
- THEN the returned `PlanResponseDto.confidence` equals `0.74`
- AND the value is not rounded, clamped, or modified

---

### Requirement: Agenda-not-found returns HTTP 422 (Phase 2+)

When a doctor's `Agenda` cannot be loaded for today's date (no working-hours record),
`POST /messages` MUST return HTTP 422 Unprocessable Entity. It MUST NOT return 404, 500,
or an empty `PlanResponseDto`.

#### Scenario: no Agenda for today returns 422

- GIVEN no working-hours record exists for the hardcoded doctor on today's date
- WHEN `POST /messages` receives `{ "message": "Voy a llegar tarde" }`
- THEN the HTTP response status is 422
- AND the response body contains an error indicator (e.g., `{ "error": "agenda_not_found" }`)
- AND the response is NOT 200, 404, or 500

---

### Requirement: Language returns hard-coded DELAY intent (stable, Phase 0+)

`language` MUST expose `POST /interpret` accepting `{ "message": string }`.
It MUST return a hard-coded `DELAY` intent regardless of the message content.
The response shape MUST be stable so Phase 3 can replace the stub body without
changing the endpoint contract.

#### Scenario: /interpret returns the hard-coded DELAY contract for any input

- GIVEN `language` is running
- WHEN `POST /interpret` receives `{ "message": "<any string>" }`
- THEN the response status is 200
- AND the response body is exactly `{ "intent": { "kind": "DELAY", "params": { "minutes": 15 } }, "confidence": 1.0 }`

#### Scenario: /interpret rejects a missing message field

- GIVEN `language` is running
- WHEN `POST /interpret` receives a body without the `message` field
- THEN the response status is 422 (Unprocessable Entity)

---

### Requirement: Language port contract unchanged at the HTTP boundary (Phase 2+)

The `POST /messages` request body shape MUST remain `{ "message": string }` (unchanged from Phase 0).
No new fields are added to the request in Phase 2+.

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

### Requirement: Scheduling handles language unavailability gracefully

When `language` is unreachable, `scheduling` MUST return a structured error
response — not crash, not hang indefinitely, and not expose internal stack traces.
This requirement proves the synchronous coupling failure surface honestly
(ADR-0007 consequence: "timeouts, retries, and a fallback must be designed").

#### Scenario: language is down — scheduling returns structured error

- GIVEN `language` is NOT running or unreachable at `LANGUAGE_URL`
- WHEN `scheduling POST /messages` receives a valid request
- THEN `scheduling` responds with HTTP 503
- AND the response body is `{ "error": "language_unavailable" }`
- AND the `scheduling` process does NOT crash

#### Scenario: language times out — scheduling returns structured error

- GIVEN `language` is reachable but does not respond within the configured timeout (5s)
- WHEN `scheduling POST /messages` receives a valid request
- THEN `scheduling` responds with HTTP 503
- AND the response body is `{ "error": "language_unavailable" }`

---

### Requirement: CORS permits web origin in development

`scheduling` MUST be configured to accept cross-origin requests from the web
app's dev origin (default: `http://localhost:5173`) in the development
environment. This is required because web (Vite, port 5173) and scheduling
(NestJS, port 3000) run on different ports under `make dev`.

#### Scenario: browser can call scheduling from the web dev origin

- GIVEN `scheduling` is running with CORS enabled for `http://localhost:5173`
- WHEN the browser sends a `POST /messages` request from `http://localhost:5173`
- THEN the response includes `Access-Control-Allow-Origin: http://localhost:5173`
- AND the browser does not block the response

#### Scenario: CORS preflight for POST is handled

- GIVEN `scheduling` is running with CORS enabled
- WHEN the browser sends an `OPTIONS /messages` preflight request
- THEN `scheduling` responds with HTTP 204 or 200
- AND the response includes appropriate `Access-Control-Allow-Methods` and
  `Access-Control-Allow-Headers`

---

## Test Runner Notes

Only `scheduling` has a test runner (Jest, unit + e2e) as of Phase 0–2. Requirements
targeting `scheduling` MUST be covered by automated tests. Requirements targeting
`language` and `web` are verified manually or via integration smoke tests until
those apps gain test infrastructure.

| Requirement | Target app | Automatable now | Phase |
|---|---|---|---|
| Web-to-Scheduling REST submission | `web` | Manual / E2E only | 0+ |
| scheduling orchestrates message → Plan | `scheduling` | Yes — Jest unit + e2e | 2+ |
| Agenda-not-found → HTTP 422 | `scheduling` | Yes — Jest e2e | 2+ |
| PlanResponseDto time fields are HH:MM | `scheduling` | Yes — Jest unit | 2+ |
| Confidence passes through unchanged | `scheduling` | Yes — Jest unit | 2+ |
| language returns hard-coded DELAY | `language` | Manual / curl smoke test | 0+ |
| scheduling handles language unavailability | `scheduling` | Yes — Jest unit | 0+ |
| CORS permits web origin | `scheduling` | Yes — Jest e2e | 0+ |
| Request body stays { message } only | `scheduling` | Yes — Jest e2e | 2+ |

---

## Deferred

**`persistence-write`** — Writing to `appointments` (apply plan) and `change_history`
(audit) are deferred to Phase 4. Phase 2 is read-only. Persistence connectivity
(Postgres, Neon, Prisma) is stable as of Phase 2.

**`plan-confirmation-and-apply`** — The doctor confirming the proposed plan and
triggering apply(plan) is deferred to Phase 4. Phase 2 returns a proposed plan only.

**`frontend-rendering`** — The web UI update to render `PlanResponseDto` shape is
deferred to Phase 4. Phase 2 may visibly break the frontend until the UI adapts.

**`real-nlu`** — Real Language NLU replaces the hardcoded DELAY stub in Phase 3.
The contract envelope and `scheduling` integration are stable from Phase 0–3.
