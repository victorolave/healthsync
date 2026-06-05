# interpret-pipeline Specification

## Purpose

End-to-end message round-trip across all three apps: a doctor's free-text message
typed in the web UI travels to `scheduling` (NestJS BFF) via REST, which forwards
it to `language` (FastAPI) via a synchronous `POST /interpret`, receives a
hard-coded `DELAY` intent, and returns it to the web UI for rendering.

No domain logic, no real NLU, no database. Contracts only.

## Agreed contract (stable from Phase 0 through Phase 3)

The intent is **data** in the ADR-0005 `{ kind, params }` shape. `language` MUST
return, and `scheduling` MUST pass through, this body:

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

### Endpoints

- **language** — `POST /interpret`, request `{ "message": string }`.
- **scheduling** (BFF) — `POST /messages`, request `{ "message": string }`.

---

## Requirements

### Requirement: Web-to-Scheduling REST submission

The web app MUST expose a text input and a submit control that POST the doctor's
message to `scheduling POST /messages`. On a successful response it MUST render the
returned intent structure in the UI. The web app MUST NOT call `language`
directly — `scheduling` is the only backend for the frontend (ADR-0007 BFF rule).

#### Scenario: Happy-path round-trip renders DELAY intent

- GIVEN the web app is running and `scheduling` is reachable at its configured URL
- WHEN the doctor types any non-empty message and submits
- THEN the web app POSTs `{ "message": "<text>" }` to `scheduling POST /messages`
- AND the UI renders the returned intent — `DELAY` with `params.minutes: 15`

#### Scenario: Empty message is not submitted

- GIVEN the web app is running
- WHEN the doctor attempts to submit with an empty message field
- THEN no HTTP request is made to `scheduling`
- AND the UI provides feedback that a message is required

---

### Requirement: Scheduling interprets and proxies

`scheduling` MUST expose `POST /messages` accepting `{ "message": string }`.
It MUST forward the message to `language POST /interpret` via synchronous
HTTP+JSON and return the response body unchanged to the caller (ADR-0007). It MUST
NOT add domain logic, modify the intent payload, or persist anything.

#### Scenario: scheduling proxies language's response unchanged

- GIVEN `language` is running and `scheduling` has `LANGUAGE_URL` configured
- WHEN `scheduling POST /messages` receives `{ "message": "Voy a llegar 15 minutos tarde" }`
- THEN `scheduling` calls `language POST /interpret` with `{ "message": "Voy a llegar 15 minutos tarde" }`
- AND `scheduling` returns the exact JSON body that `language` responded with
- AND the HTTP status code returned to the caller is 200

#### Scenario: scheduling returns 200 with the DELAY contract on any message

- GIVEN `language` is running
- WHEN `scheduling POST /messages` receives any valid `{ "message": string }` body
- THEN the response body is `{ "intent": { "kind": "DELAY", "params": { "minutes": 15 } }, "confidence": 1.0 }`
- AND the Content-Type is `application/json`

---

### Requirement: Language returns hard-coded DELAY intent

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

Only `scheduling` has a test runner (Jest, unit + e2e) as of Phase 0. Requirements
targeting `scheduling` MUST be covered by automated tests. Requirements targeting
`language` and `web` are verified manually or via integration smoke tests until
those apps gain test infrastructure.

| Requirement | Target app | Automatable now |
|---|---|---|
| Web-to-Scheduling REST submission | `web` | Manual / E2E only |
| scheduling interprets and proxies | `scheduling` | Yes — Jest unit + e2e |
| language returns hard-coded DELAY | `language` | Manual / curl smoke test |
| scheduling handles language unavailability | `scheduling` | Yes — Jest unit |
| CORS permits web origin | `scheduling` | Yes — Jest e2e |

---

## Deferred

**`persistence-connectivity`** — Postgres connection probe (`SELECT 1`) from
`scheduling` is deferred to Phase 2. Reason: Postgres lives only in docker-compose
and is not in the `make dev` path. Phase 0 MUST be fully runnable via `make dev`
with no Docker and no database.
