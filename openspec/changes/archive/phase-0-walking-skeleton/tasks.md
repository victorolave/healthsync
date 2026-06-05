# Tasks: Phase 0 — Walking Skeleton

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350–450 (10 files: 2 modify existing, 6 create new, 2 create .env.example) |
| 400-line budget risk | Medium–High |
| Chained PRs recommended | No |
| Suggested split | Single PR (delivery strategy: single-pr) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

**Note for orchestrator:** Delivery strategy is `single-pr`. Estimated lines are borderline (350–450). A `size:exception` is required before `sdd-apply` starts. Most additions are thin boilerplate; the test files account for ~150 lines of that estimate. Single PR is rational given the additive nature (zero deletions, one new path per app).

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 10 file changes + tests in one PR | PR 1 | size:exception; additive only; no DB |

---

## Phase 1: Foundation — DTOs, Config, and Env Files

- [x] 1.1 Create `apps/scheduling/src/messages/dto/message.dto.ts` — `MessageDto { message: string }` with `@IsString() @IsNotEmpty()` (class-validator). No test (DTO only). [spec: scheduling interprets and proxies]
- [x] 1.2 Create `apps/scheduling/src/messages/dto/intent-response.dto.ts` — `IntentResponseDto { intent: { kind: string; params: Record<string, unknown> }; confidence: number }`. No test. [spec: contract shape ADR-0005]
- [x] 1.3 Create `apps/web/.env.example` — single line `VITE_SCHEDULING_URL=http://localhost:3000`. No test (doc file). [spec: env config]
- [x] 1.4 Create `apps/scheduling/.env.example` — single line `LANGUAGE_URL=http://localhost:8000`. No test (doc file). [spec: env config]

## Phase 2: language — POST /interpret (FastAPI)

> No automated test runner for language. Verification: curl smoke test.

- [x] 2.1 Modify `apps/language/app/main.py` — add Pydantic `InterpretRequest` model `{ message: str }` and `IntentResponse` model `{ intent: { kind: str, params: dict }, confidence: float }`. [spec: language returns hard-coded DELAY]
- [x] 2.2 Modify `apps/language/app/main.py` (continued) — add `POST /interpret` route that returns the hard-coded `{ "intent": { "kind": "DELAY", "params": { "minutes": 15 } }, "confidence": 1.0 }` for any valid input; FastAPI validates `message` presence (422 on missing field automatically). [spec: /interpret returns DELAY; /interpret rejects missing message]
- [x] 2.3 Manual smoke: `curl -X POST http://localhost:8000/interpret -H 'Content-Type: application/json' -d '{"message":"test"}'` → assert 200 + DELAY shape. `curl` without `message` → assert 422. [spec: language scenarios; no automated runner]

## Phase 3: scheduling — LanguageClient + MessagesService + MessagesController (NestJS)

> All scheduling tasks MUST follow RED → GREEN order. Write the failing test first, then implement.

### 3.1 RED — LanguageClient unit test skeleton
- [x] 3.1 Create `apps/scheduling/src/messages/language.client.spec.ts` — write failing tests:
  - `interprets()` calls `fetch` with `LANGUAGE_URL/interpret`, method POST, JSON body.
  - On non-2xx response, throws `ServiceUnavailableException`.
  - On fetch timeout (AbortController), throws `ServiceUnavailableException`.
  Run: `cd apps/scheduling && pnpm test` — expect RED. [spec: language unavailable scenarios]

### 3.2 GREEN — LanguageClient implementation
- [x] 3.2 Create `apps/scheduling/src/messages/language.client.ts` — `@Injectable() LanguageClient` with `interprets(message: string): Promise<IntentResponseDto>`:
  - Reads `process.env.LANGUAGE_URL ?? 'http://localhost:8000'`.
  - Uses `fetch` with 5s `AbortController` timeout.
  - On non-2xx or AbortError: throws `new ServiceUnavailableException({ error: 'language_unavailable' })`.
  Run: `cd apps/scheduling && pnpm test` — expect GREEN on LanguageClient tests. [spec: scheduling handles language unavailability; ADR-0002 outbound port]

### 3.3 RED — MessagesService unit test skeleton
- [x] 3.3 Create `apps/scheduling/src/messages/messages.service.spec.ts` — write failing tests (mock `LanguageClient`):
  - `process()` returns language's response unchanged.
  - When `LanguageClient` throws `ServiceUnavailableException`, service re-throws it (controller catches it as 503).
  Run: `cd apps/scheduling && pnpm test` — expect RED. [spec: scheduling proxies language's response unchanged]

### 3.4 GREEN — MessagesService implementation
- [x] 3.4 Create `apps/scheduling/src/messages/messages.service.ts` — `@Injectable() MessagesService` with `process(dto: MessageDto): Promise<IntentResponseDto>`:
  - Calls `languageClient.interprets(dto.message)`.
  - Returns result directly (no transformation, no persistence).
  Run: `cd apps/scheduling && pnpm test` — expect GREEN on MessagesService tests. [spec: scheduling proxies language unchanged]

### 3.5 — MessagesController
- [x] 3.5 Create `apps/scheduling/src/messages/messages.controller.ts` — `@Controller('messages') MessagesController`:
  - `@Post() async create(@Body() dto: MessageDto)` — calls `messagesService.process(dto)`, returns result.
  - Thin: no logic, no error handling here (service/client handle it; Nest maps `ServiceUnavailableException` to 503 automatically).
  Note: controller covered by the e2e test in task 3.6; no separate unit test needed. [spec: scheduling proxies; CORS setup done in 3.7]

### 3.6 RED → GREEN — e2e test: POST /messages wiring + CORS preflight
- [x] 3.6 Create `apps/scheduling/test/messages.e2e-spec.ts` (supertest, stub LanguageClient):
  - RED first: write tests for `POST /messages` → 200 with DELAY body; `POST /messages` language stub throws → 503 `{ error: 'language_unavailable' }`; `OPTIONS /messages` preflight → 204/200 with CORS headers.
  - GREEN: confirm passes after app.module wiring (task 3.7) is done.
  Run: `cd apps/scheduling && pnpm test:e2e` [spec: scheduling proxies; CORS preflight; language unavailable]

## Phase 4: scheduling — Module Wiring + CORS

- [x] 4.1 Modify `apps/scheduling/src/app.module.ts` — add `MessagesController` to controllers array; add `MessagesService` and `LanguageClient` to providers array. [spec: wiring; no new test — covered by e2e in 3.6]
- [x] 4.2 Modify `apps/scheduling/src/main.ts` — add `app.enableCors({ origin: 'http://localhost:5173', methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Accept'] })` before `app.listen()`. [spec: CORS permits web origin]
- [x] 4.3 Run full test suite: `cd apps/scheduling && pnpm test && pnpm test:e2e` — all tests GREEN. [verification gate]

## Phase 5: web — Message Input + Intent Rendering (React + Vite)

> No automated test runner for web. Verification: manual browser smoke test.

- [x] 5.1 Modify `apps/web/src/App.tsx` — add controlled text input (`<input>`) and submit button. Empty message: disable submit or show inline message; no HTTP request fired. [spec: empty message is not submitted]
- [x] 5.2 Modify `apps/web/src/App.tsx` (continued) — on submit: `POST ${import.meta.env.VITE_SCHEDULING_URL ?? 'http://localhost:3000'}/messages` with `{ message }`, then render returned `intent.kind` and `intent.params` in the UI. [spec: happy-path round-trip renders DELAY intent]
- [ ] 5.3 Manual smoke: `make dev` → open `http://localhost:5173` → type any message → submit → verify UI shows `DELAY` with `minutes: 15`. Test empty submit → no request, UI feedback shown. [spec: web scenarios; no automated runner]

## Phase 6: Cross-cutting Verification

- [x] 6.1 Run `cd apps/scheduling && pnpm test && pnpm test:e2e` — final green gate for all scheduling tests. [coverage: MessagesService proxy, LanguageClient error/timeout, CORS e2e]
- [x] 6.2 Smoke-test `language` with curl: verify `POST /interpret` → 200 DELAY; missing `message` → 422. [spec: language scenarios]
- [ ] 6.3 Full round-trip: `make dev`, browser at `:5173`, type message, confirm DELAY renders. [spec: happy-path end-to-end]
- [ ] 6.4 Verify no `.env` file required for `make dev` to work (defaults cover all three apps). [spec: env config]

---

## Task Coverage Summary

| Task(s) | App | Spec Requirement | Automated? |
|---------|-----|-----------------|------------|
| 2.1–2.3 | language | /interpret returns DELAY; 422 on missing field | Manual/curl |
| 3.1–3.2 | scheduling | LanguageClient; timeout/unavailable → 503 | Jest unit |
| 3.3–3.4 | scheduling | MessagesService proxies unchanged | Jest unit |
| 3.5 | scheduling | Controller thin layer | Jest e2e (via 3.6) |
| 3.6 | scheduling | POST /messages wiring; 503 error; CORS preflight | Jest e2e |
| 4.1–4.2 | scheduling | Module registration; CORS enable | Covered by e2e |
| 5.1–5.3 | web | Text input; empty guard; render intent | Manual |
| 1.1–1.4 | cross | DTOs; .env.example docs | None needed |
| 6.1–6.4 | all | Final green gates | Mixed |
