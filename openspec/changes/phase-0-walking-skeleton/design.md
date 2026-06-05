# Design: Phase 0 — Walking Skeleton

## Technical Approach

Prove the inter-service HTTP round-trip web → scheduling → language → back, with
zero domain logic, running entirely under `make dev` (no Docker, no database).
Postgres connectivity is **DEFERRED to Phase 2** (orchestrator decision) — this
design covers ONLY the synchronous REST slice per ADR-0007. Each app gains exactly
one new path. The intent payload uses the `{ kind, params }` value shape from
ADR-0005 so it survives unchanged into Phase 3. Seams are kept hexagonal-friendly
(ADR-0002): the NestJS controller stays thin and delegates to a service that talks
to language through a single outbound port, so Phase 1's domain (planners,
registry) slots in behind that service without touching the controller or the
language client.

## Architecture Decisions

### Decision: HTTP client in scheduling → language

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Native `fetch` (Node 22+) | Zero deps; stable global; manual JSON/error handling | **CHOSEN** |
| `@nestjs/axios` + axios | Rx integration, interceptors; adds 2 deps + RxJS plumbing for one call | Rejected |
| raw `axios` | Familiar; still a dep + types for one POST | Rejected |

**Rationale**: scheduling has NO HTTP client dep today (`package.json` confirms only
nest core/common/platform-express + rxjs). `@types/node` ^24 and Nest 11 imply a
Node 22+ runtime where `fetch` is a stable global. One outbound call does not
justify a dependency. We wrap `fetch` inside an injectable `LanguageClient`
(the outbound port) so swapping to axios/gRPC later is a one-file change.

### Decision: Inbound BFF endpoint shape

**Choice**: `POST /messages` on scheduling, body `{ message: string }`, returns the
language intent plus envelope metadata.
**Alternatives considered**: `POST /interpret` (mirrors language — rejected: leaks
the internal contract name to the browser and conflates BFF with the NLU service);
`POST /intents` (rejected: the client sends a message, not an intent).
**Rationale**: `/messages` names what the doctor's app actually sends. Keeps the BFF
vocabulary distinct from the internal language vocabulary (ADR-0007: language is
internal, never browser-facing).

### Decision: Hexagonal seam (no domain yet)

**Choice**: `MessagesController` → `MessagesService` → `LanguageClient` (port).
No domain model, no planners (Phase 1).
**Alternatives considered**: controller calls `fetch` directly (rejected: forces a
rewrite in Phase 1 and couples transport to HTTP routing).
**Rationale**: ADR-0002. In Phase 1 `MessagesService` gains the planner registry
(ADR-0005) between receiving the intent and responding; the controller and
`LanguageClient` stay untouched. The seam is created now so later phases extend,
not rework.

### Decision: Config via env with localhost defaults

**Choice**: scheduling reads `LANGUAGE_URL` (default `http://localhost:8000`);
web reads `VITE_SCHEDULING_URL` (default `http://localhost:3000`). Read through
`@nestjs/config` is overkill for one var — use `process.env.LANGUAGE_URL ?? default`.
**Rationale**: matches the existing `process.env.PORT ?? 3000` pattern in `main.ts`.
Defaults make `make dev` work with no `.env` file. Vite only exposes `VITE_`-prefixed
vars to the browser bundle.

### Decision: Error handling when language is unreachable

**Choice**: `LanguageClient` failure (connection refused / non-2xx / timeout) →
`MessagesService` throws a Nest `ServiceUnavailableException` (HTTP 502/503) with a
clean JSON body `{ error: "language_unavailable" }`. A 5s `AbortController` timeout
guards the doctor's wait (ADR-0007 names slow language as the synchronous risk).
**Rationale**: surfaces a typed, renderable failure to web instead of a raw stack
trace; Phase 1+ can map this to a doctor-facing fallback.

## Data Flow

```
[ web :5173 ]
   │  POST /messages { message }
   ▼
[ scheduling :3000 ]  MessagesController → MessagesService → LanguageClient
   │  POST /interpret { message }      (fetch, 5s timeout)
   ▼
[ language :8000 ]  returns hard-coded DELAY { kind, params, confidence }
   ▲
   └─ scheduling wraps intent in response envelope ─→ web renders
```

No database in this phase. (Phase 2 adds the persistence port behind MessagesService.)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/language/app/main.py` | Modify | Add `POST /interpret`; Pydantic request/response models; hard-coded DELAY |
| `apps/scheduling/src/messages/messages.controller.ts` | Create | `POST /messages`, thin, delegates to service |
| `apps/scheduling/src/messages/messages.service.ts` | Create | Orchestrates one LanguageClient call; maps errors |
| `apps/scheduling/src/messages/language.client.ts` | Create | Outbound port: `fetch` to `LANGUAGE_URL/interpret`, timeout |
| `apps/scheduling/src/messages/dto/*.ts` | Create | Request/response types (message in, intent envelope out) |
| `apps/scheduling/src/app.module.ts` | Modify | Register MessagesController + providers |
| `apps/scheduling/src/main.ts` | Modify | `app.enableCors()` for the web origin (5173) |
| `apps/web/src/App.tsx` | Modify | Message input + submit; POST to scheduling; render intent |
| `apps/web/.env.example` | Create | Document `VITE_SCHEDULING_URL` |
| `apps/scheduling/.env.example` | Create | Document `LANGUAGE_URL` |

## Interfaces / Contracts

language `POST /interpret`:
```jsonc
// request
{ "message": "Push my 3pm back 30 minutes" }
// response — hard-coded DELAY, shape stable into Phase 3 (ADR-0005)
{
  "intent": { "kind": "DELAY", "params": { "minutes": 30 } },
  "confidence": 1.0
}
```

scheduling `POST /messages`:
```jsonc
// request
{ "message": "Push my 3pm back 30 minutes" }
// success
{
  "intent": { "kind": "DELAY", "params": { "minutes": 30 } },
  "confidence": 1.0,
  "source": "language"
}
// language unreachable → HTTP 503
{ "error": "language_unavailable" }
```

Note: `intent.kind` is UPPERCASE matching ADR-0005's taxonomy; `params` is an open
object whose shape is intent-specific. Keep this exact shape — Phase 1 planners key
off `intent.kind` and read `params`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (language) | `/interpret` returns DELAY shape | pytest + FastAPI TestClient |
| Unit (scheduling) | MessagesService maps intent; maps language failure to 503 | Jest, mock LanguageClient |
| Integration (scheduling) | `POST /messages` wiring | supertest, language client stubbed |
| E2E (manual) | Full round-trip renders in browser | `make dev`, type message, see DELAY |

## Migration / Rollout

No migration. All changes additive (one new path per app). Revert = drop the new
files + the CORS/module wiring. No DB, no schema.

## Env Vars

| Var | App | Default | Purpose |
|-----|-----|---------|---------|
| `LANGUAGE_URL` | scheduling | `http://localhost:8000` | Outbound base URL to language |
| `VITE_SCHEDULING_URL` | web | `http://localhost:3000` | Browser → BFF base URL |
| `PORT` | scheduling | `3000` | Already wired in main.ts |

`make dev` already starts all three (language:8000, scheduling:3000, web:5173) with
NO Docker. With the defaults above, no `.env` is required for local dev.

## Open Questions

- [ ] None blocking. (Postgres connectivity intentionally deferred to Phase 2 per
      orchestrator scope decision — the proposal's persistence-connectivity criterion
      moves to Phase 2.)
