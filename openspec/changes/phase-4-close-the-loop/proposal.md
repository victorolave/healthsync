# Phase 4 — Close the Loop (umbrella proposal)

This umbrella proposal covers ALL of Phase 4: the doctor confirms a proposed plan,
the agenda is mutated atomically, affected patients become persisted notification
entities, real-time updates flow over SSE, and the frontend is rebuilt on the
HealthSync design system so the end-to-end loop the PRD describes (§5) finally
works in the browser.

Phase 4 is the largest single phase. This proposal fixes the umbrella intent,
scope, contracts, and the locked decisions, then hands off to **spec → design →
tasks → apply executed SLICE BY SLICE**, starting with `FE-foundation`.

---

## Quick path (what we are committing to)

1. **Confirm = RE-DERIVE.** The frontend echoes the original message; the server
   re-runs `recalculate` against the CURRENT agenda at confirm time, then applies.
   No persisted-plan model, no `planId` on the contract.
2. **Apply = one atomic transaction.** Appointment updates + change_history write +
   notification inserts in a single Prisma `$transaction`. A DB EXCLUDE violation
   maps to **409 Conflict**; rejection means **no writes**.
3. **Notification = stateful entity** (ADR-0013 lifecycle), new Prisma model,
   created behind a dedicated `NotificationsService` port (hexagonal).
4. **SSE = rxjs Subject** behind `@Sse('events')`, emitting `plan-ready` and
   `notification-created`; acknowledgement advances state over REST.
5. **Frontend = Tailwind v4 + shadcn/ui + HealthSync tokens**, atomic design +
   container/presentational, Vitest. Fixes the currently-broken `App.tsx`.
6. **Delivery = 4 chained PRs, stacked-to-main.** Start with `FE-foundation`.

---

## Intent

### What problem

Phases 0–3 built the read-only half of the loop: a doctor's message is interpreted
(`language`), a `Plan` is computed against a persisted agenda (`scheduling`), and a
`PlanResponseDto` is returned. But:

- **The plan can be proposed, never applied.** `AgendaRepository` is read-only;
  `apply(plan)` does not exist (ADR-0004's "only operation that mutates" is unbuilt).
- **The audit port fails loud.** `FailingChangeHistoryRepository.record()` throws —
  a deliberate Phase-2 placeholder that Phase 4 must replace.
- **No patient is ever told.** There is no notification entity, no SSE channel.
- **The frontend is broken.** `App.tsx` still renders the old `IntentResponse`
  shape and shows nothing meaningful for the real `PlanResponseDto`. It has no
  design system, no test runner.

### Why now

Confirmation and notification only make sense once there is a real `Plan` to
confirm and real changes to announce (BUILD-PLAN §Phase 4). All upstream contracts
(language envelope, `PlanResponseDto`, persistence, the no-double-booking
constraint) are stable as of Phase 2–3. The ADRs that govern this phase — 0004
(plan-as-unit-of-change), 0012 (SSE), 0013 (notification lifecycle) — are all
Accepted. The only thing missing is the apply side and the UI to drive it.

### What success looks like

A doctor types a message in the browser, sees a clean proposed-plan card, clicks
**Confirm**, and:

- the agenda is mutated atomically (or cleanly rejected with 409 on conflict),
- a `change_history` row records the applied change,
- a `Notification` is created per affected patient and pushed over SSE,
- the notifications view updates in real time,
- on discard, **nothing changes** — no writes, no notifications.

This closes the end-to-end PRD §5 flow and makes D1 (propose-and-confirm) a
property of the running system, not just the domain model.

---

## Scope

### In scope

| Area | What |
|------|------|
| Apply path | `AgendaRepository` write method + Prisma impl; real `PrismaChangeHistoryRepository`; atomic `$transaction`; 409 on EXCLUDE violation; re-derive revalidation |
| Notifications | New `Notification` Prisma model + migration; `NotificationRepository` port + adapter; `NotificationsService`; ADR-0013 lifecycle states |
| Real-time | `EventsModule` + `@Sse('events')` (rxjs Subject); `plan-ready` + `notification-created` events; `POST /notifications/:id/acknowledge`; CORS origin parameterized via env |
| Confirm API | `POST /messages/confirm` (re-derive → apply); response = applied operations + created notifications |
| Frontend foundation | Tailwind v4 + shadcn/ui + HealthSync tokens + brand assets + app shell; fix `App.tsx` to render `PlanResponseDto`; Vitest |
| Frontend loop | Confirm action → confirm endpoint; `useEventSource` hook; `NotificationsView`; SSE consumption |
| interpret-pipeline delta | Emit `plan-ready` SSE after `POST /messages` computes a plan |

### Out of scope (explicit)

| Item | Why / deferred to |
|------|-------------------|
| `CANCEL_BLOCK` planner, clarification path | Phase 5 |
| `EXTEND` planner | Stretch |
| Patient accept/decline → recalculation (Scenario 4 EARLY) | ADR-0013 *response* states modeled in the entity, but the recalc trigger is deferred; this phase ships PENDING→SENT→DELIVERED→READ + acknowledge only |
| Fallback timeout / escalation / coordinator role | ADR-0013 explicitly defers the concrete mechanism; we persist `expiresAt` but do not run a scheduler |
| Multi-doctor / multi-tab SSE fan-out | MVP single-doctor; single shared Subject is sufficient (risk noted) |
| Auth on the SSE channel (query-param token) | MVP; EventSource header limitation noted for future |
| History view UI | Records are queryable; the view is future |
| Routing library / global state manager | Local state + a thin hook are enough for MVP |

---

## Locked decisions (the user chose these)

### LD1 — Confirm strategy = RE-DERIVE on confirm

The frontend re-sends the **original message** on confirm. The server re-runs the
full `interpret → load CURRENT agenda → recalculate` pipeline at confirm time, then
applies the freshly-derived plan.

- Satisfies ADR-0004's "a Plan computed against a stale agenda MUST be revalidated
  at apply time" — staleness is handled *by construction*, because the plan is
  derived from the current agenda the instant before apply.
- Needs **no persisted-plan model** and adds **no `planId`** to the contract.
- The `ChangeHistoryEntry` shape already carries `rawMessage`, `intentKind`,
  `intentParams`, `planSnapshot` — re-derive feeds it naturally for audit (§4.7).

Trade-off accepted: confirm re-pays the `language` round-trip (~the 10s-timeout
HTTP call). For MVP single-doctor this is acceptable and keeps the contract minimal.

### LD2 — Delivery = 4 chained PRs, stacked-to-main, starting with FE-foundation

Each PR merges to main in order. `FE-foundation` and `BE-apply` are independent and
may proceed in parallel; the order below is the merge/review order.

### LD3 — Frontend engine = Tailwind v4 (CSS-first `@theme`) + shadcn/ui (`cssVariables`)

Atomic design + container/presentational separation (project convention). Brand
assets copied from repo-root `assets/` into `apps/web/public`.

---

## The 4 capabilities introduced/changed

| # | Capability | Status | What it owns | Slice(s) |
|---|------------|--------|--------------|----------|
| 1 | `plan-confirmation` | NEW | `POST /messages/confirm`, re-derive revalidation, atomic apply `$transaction`, 409 conflict mapping, change_history write | PR2 (BE-apply) |
| 2 | `notifications` | NEW | ADR-0013 lifecycle entity, Prisma model + migration, `NotificationRepository` port + adapter, `NotificationsService`, acknowledge endpoint | PR2 (model+create) + PR3 (acknowledge+SSE emit) |
| 3 | `realtime-sse` | NEW | `EventsModule`, `@Sse('events')` rxjs Subject, `plan-ready` + `notification-created` events, CORS env-parameterization | PR3 (BE-notify+SSE) |
| 4 | `web-ui` | NEW | Tailwind v4 + shadcn + HealthSync tokens, app shell, `ChatInput`, `ProposedPlanView`, confirm action, `useEventSource`, `NotificationsView`, Vitest | PR1 (foundation) + PR4 (loop) |

**Delta to existing capability** `interpret-pipeline`: `POST /messages` gains a
side-effect — after computing the plan it emits a `plan-ready` SSE event. The
request/response contract of `POST /messages` is UNCHANGED (still `{ message }` in,
`PlanResponseDto` out). This delta is delivered in PR3 (where the SSE stream exists).

---

## The confirm contract (under re-derive)

### Request

```http
POST /messages/confirm
Content-Type: application/json

{ "message": "Voy a llegar 15 minutos tarde" }
```

The client echoes the **raw original message** — the same body `POST /messages`
received. No `planId`, no `intent`, no operations echoed. The server is the single
source of truth: it re-interprets and re-derives, so the client cannot smuggle a
stale or forged plan.

### Response (success)

```jsonc
{
  "status": "applied",                 // the 'applied' literal the Phase-2 envelope reserved
  "operations": [                      // the operations actually applied (re-derived)
    { "type": "move", "appointmentId": "...", "patientId": "...",
      "from": { "start": "14:00", "end": "14:30" },
      "to":   { "start": "14:15", "end": "14:45" } }
  ],
  "notifications": [                   // notifications created this confirm
    { "id": "...", "patientId": "...", "appointmentId": "...",
      "state": "SENT",
      "payload": { "from": {...}, "to": {...}, "reason": "DELAY" } }
  ],
  "confidence": 0.97
}
```

`status: "applied"` reuses the literal the Phase-2 `PlanResponseDto` envelope
deliberately reserved ("exists to allow Phase 4 to introduce 'applied' and
'confirmed'") — no envelope break.

### Response (conflict)

```jsonc
// HTTP 409
{ "error": "agenda_conflict", "detail": "no_double_booking" }
```

Returned when the re-derived plan is valid but the DB EXCLUDE constraint fires on
write (a concurrent change slipped in). NOT 500.

### Error reuse

`agenda_not_found` → 422 and `language_unavailable` → 503 are inherited unchanged
from `POST /messages`, because confirm re-runs the same pipeline.

### Degradation — "user refreshes and loses state" (exploration risk 2)

Re-derive makes this a **non-issue for correctness**: the client only needs the raw
message to confirm. If the page is refreshed and the proposed plan is lost, the
doctor simply re-sends the message (cheap, idempotent on the read side — no writes
happen until confirm). We document this explicitly: **proposed plans are ephemeral
client state by design; durability begins at confirm.** No server-side draft store.

---

## The apply transaction

A single Prisma `$transaction` performs, atomically:

1. **Appointment updates** — apply each re-derived `move` operation
   (`updateAppointment(id, newSlot)` on the write-capable `AgendaRepository`).
2. **change_history insert** — one row, `applied: true`, with `rawMessage`,
   `intentKind`, `intentParams`, `planSnapshot` (the re-derived plan).
3. **Notification inserts** — one `Notification` per affected patient, state
   `PENDING`→`SENT`, payload = the change.

Rules:

- **All-or-nothing.** Any failure rolls back the whole transaction — no partial
  agenda mutation, no orphan history, no phantom notifications.
- **EXCLUDE violation → 409.** Prisma does NOT auto-retry serialization/exclusion
  failures; the constraint error propagates. A dedicated mapper translates the
  Postgres exclusion-violation error code into a `409 Conflict` with
  `{ error: "agenda_conflict" }` — never a leaked 500/stack trace.
- **Rejection (discard) writes nothing.** Discard is a pure client action; it never
  calls `POST /messages/confirm`. ADR-0004 "on rejection, nothing changes" holds by
  construction.

SSE emission of `notification-created` happens **after** the transaction commits
(PR3), so a rolled-back apply never pushes a notification.

---

## Notification entity (ADR-0013)

### Lifecycle states

```
PENDING → SENT → DELIVERED → READ → RESPONDED (ACCEPTED | DECLINED)
            │
            └─ no ack within window → EXPIRED / FAILED   (fallback — modeled, not driven)
```

Phase 4 ships `PENDING → SENT → DELIVERED → READ` + the acknowledge endpoint.
`RESPONDED_*` and `EXPIRED/FAILED` columns/enum values exist in the model (so the
schema is complete and ADR-0013-faithful) but the transitions are not driven this
phase.

### Prisma model

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `doctor_id` | UUID | |
| `patient_id` | UUID | |
| `appointment_id` | UUID | |
| `change_history_id` | UUID FK | links to the applied change (audit trail) |
| `state` | enum | `PENDING, SENT, DELIVERED, READ, RESPONDED_ACCEPTED, RESPONDED_DECLINED, EXPIRED, FAILED` |
| `payload` | JSONB | `{ from, to, reason }` — what changed |
| `sent_at` `delivered_at` `read_at` `responded_at` `expires_at` | TIMESTAMPTZ? | lifecycle timestamps |
| `created_at` | TIMESTAMPTZ | default now() |

Decision: **JSONB payload + structured state columns** — JSONB keeps the "what
changed" flexible; the state and timestamps are first-class columns so completeness
(§9) is a queryable property.

### Who creates them — dedicated `NotificationsService` behind a port (hexagonal)

Recommended (and locked direction): a `NotificationsService` owns the
`NotificationRepository` port. `MessagesService` (the confirm orchestrator) calls
`NotificationsService.createForChange(changeSet)` rather than touching the
notification repository directly. This keeps the apply orchestrator from accreting
notification logic and matches ADR-0002/0003 (notifications is its own concern that
consumes the change-set). The single `$transaction` is threaded through so the
notification inserts share the apply atomicity.

---

## SSE design (ADR-0012)

- **Mechanism.** An `EventsService` holds an rxjs `Subject<MessageEvent>`. A single
  `@Sse('events')` controller method returns `eventsService.stream()`. Sufficient
  for single-doctor MVP (one shared stream per instance).
- **Events.**
  - `plan-ready` — emitted after `POST /messages` computes a plan:
    `{ type: 'plan-ready', plan: PlanResponseDto }`.
  - `notification-created` — emitted after the apply transaction commits:
    `{ type: 'notification', notification: NotificationDto }`.
- **Acknowledge endpoint.** `POST /notifications/:id/acknowledge` advances state to
  `DELIVERED`/`READ` (REST, per ADR-0013 — push stays unidirectional).
- **CORS — parameterize the hardcoded origin (exploration risk 7).** `configure-app.ts`
  currently hardcodes `http://localhost:5173`. Phase 4 reads the allowed origin(s)
  from an env var (e.g. `WEB_ORIGIN`, default `http://localhost:5173`) so the SSE +
  REST channels work in non-dev environments. EventSource cannot send custom
  headers; `credentials: false` for MVP.

---

## Frontend architecture (web-ui)

- **Engine.** Tailwind v4 CSS-first (`@import "tailwindcss"` + `@theme`), no JS
  config; `@tailwindcss/vite` plugin; shadcn/ui with `components.json`
  (`cssVariables: true`). Deps: `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, `@radix-ui/*` via shadcn.
- **Design tokens — HealthSync palette → `@theme` + shadcn CSS variables.** Map
  Clinical Blue → `--primary`, Tech Teal → `--accent`, Deep Navy → `--foreground`,
  White → `--background`. **Exact hex/HSL values MUST be sampled from the brand PNGs
  during the DESIGN phase** — the engram entry gives only approximate values
  (Clinical blue ~#1577DE, Tech teal ~#15C39A, Deep navy ~#0F2740). The proposal
  locks the mapping; design locks the numbers.
- **Brand assets.** Copy `assets/logo.png`, `logo-horizontal.png`, `logo-dark.png`,
  `icon.png` into `apps/web/public/`; reference as `/logo.png`. `icon.png` → favicon.
- **Component structure (atomic + container/presentational).**
  - Atoms/UI: shadcn primitives in `src/components/ui/`.
  - Presentational: `ChatInput`, `ProposedPlanView`, `NotificationsView` — pure,
    props-in/callbacks-out, no fetch.
  - Containers: wire data/effects (submit message, confirm, SSE) and pass props down.
- **State.** Local `useState` + a thin `useEventSource` hook for SSE. No router, no
  global store for MVP.
- **Testing.** Vitest + `@testing-library/react` + `jsdom` (standard mode, not
  strict TDD). Added in PR1 so PR4 components have a test harness.

---

## The 4-slice stacked-PR plan

```
FE-foundation (PR1) ─────────────────────────────────── FE-loop (PR4)
                                                          ↑
BE-apply (PR2) ──────────── BE-notify+SSE (PR3) ─────────┘
```

`FE-foundation` and `BE-apply` are independent (different apps, no shared code) and
may proceed in parallel. `BE-notify+SSE` depends on the notification model from
`BE-apply`. `FE-loop` is the integration slice — it needs all three predecessors.

| PR | Slice | Depends on | Capabilities | Est. lines | Budget |
|----|-------|-----------|--------------|-----------:|--------|
| PR1 | FE-foundation | none | `web-ui` (foundation) | ~200–280 | ✅ fits 400 |
| PR2 | BE-apply | none (BE-only) | `plan-confirmation`, `notifications` (model+create) | ~350–450 | ⚠ borderline |
| PR3 | BE-notify+SSE | PR2 | `realtime-sse`, `notifications` (ack), interpret-pipeline delta | ~200–280 | ✅ fits 400 |
| PR4 | FE-loop | PR1+PR2+PR3 | `web-ui` (loop) | ~250–350 | ✅ fits 400 |

### PR1 — FE-foundation (start first)

Tailwind v4 + shadcn init + HealthSync tokens + brand assets + app shell; FIX
`App.tsx` to render `PlanResponseDto` (un-break the front); display-only
`ChatInput` + `ProposedPlanView` (no confirm action yet); add Vitest.

### PR2 — BE-apply

Write-capable `AgendaRepository.updateAppointment()` + Prisma impl; real
`PrismaChangeHistoryRepository` (replace the fail-loud stub); new `Notification`
Prisma model + migration; `NotificationRepository` port + adapter;
`NotificationsService`; `POST /messages/confirm` (re-derive → `$transaction`(appt
updates + history + notifications); map EXCLUDE violation → 409).

### PR3 — BE-notify+SSE

`EventsModule` + `@Sse('events')` (rxjs Subject); emit `plan-ready` +
`notification-created`; `POST /notifications/:id/acknowledge`; CORS env-parameterize.

### PR4 — FE-loop

Confirm button → `POST /messages/confirm`; `useEventSource` hook; `NotificationsView`;
SSE consumption (plan-ready + notification-created).

---

## Test strategy

| App | Mode | Approach |
|-----|------|----------|
| `scheduling` | **STRICT TDD** (Jest) | Unit tests (mock ports) for the confirm service, 409 mapping, transaction orchestration, SSE Subject behavior. **Neon-guarded int-specs** (`describeIfDb` pattern, UUID constants, `afterAll` cleanup) for the write path: `PrismaChangeHistoryRepository`, `PrismaNotificationRepository`, and apply atomicity (commit + rollback on double-booking). |
| `web` | Standard (Vitest) | Vitest + Testing Library + jsdom for `ChatInput`, `ProposedPlanView`, `NotificationsView`, and the `useEventSource` hook. Added in PR1. |
| `language` | — | No changes this phase. |

**Live/Neon dependency.** Write-path int-specs require `DATABASE_URL` (Neon) and
self-skip without it (existing `describeIfDb` guard). If CI lacks the secret, those
specs run locally/manually — noted as a risk.

---

## Per-slice size estimates and the 400-line budget

All four slices fit the 400-line budget except **PR2 (BE-apply, ~350–450)**, which
is **borderline**. Mitigation: if PR2 trends over budget, extract the **Notification
Prisma model + migration** as a standalone micro-step/micro-PR (PR2a) ahead of the
confirm wiring (PR2b). The migration is mechanical and self-contained, making it a
clean split point. This is flagged now so `sdd-tasks` can pre-plan the boundary.

| PR | Est. lines | Action |
|----|-----------:|--------|
| PR1 | ~200–280 | proceed |
| PR2 | ~350–450 | proceed; if >400, split notification migration into PR2a |
| PR3 | ~200–280 | proceed |
| PR4 | ~250–350 | proceed |

---

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | EXCLUDE violation leaking as 500 | Dedicated error mapper → 409 `agenda_conflict`; covered by a rollback int-spec |
| 2 | Plan staleness between propose and confirm | Re-derive eliminates it — plan is computed against the current agenda at confirm |
| 3 | Refresh loses proposed plan | By design: proposed plans are ephemeral; re-send the message to re-derive (no writes until confirm) |
| 4 | SSE single-Subject doesn't fan out to multiple tabs | Acceptable for single-doctor MVP; multicast deferred to Phase 5+ |
| 5 | Neon required for write-path int-specs in CI | `describeIfDb` self-skip; document that they run locally if the CI secret is absent |
| 6 | Exact brand hex values not in code | Sample from brand PNGs during DESIGN; proposal locks only the token mapping |
| 7 | CORS hardcoded to localhost:5173 | Parameterize allowed origin via `WEB_ORIGIN` env in PR3 |
| 8 | PR2 over the 400-line budget | Pre-planned split: extract Notification migration as PR2a |
| 9 | Confirm re-pays the language round-trip | Accepted trade-off for a stateless, minimal contract; fine at MVP scale |

---

## Next step

Proceed **slice by slice**, starting with **PR1 / FE-foundation**. For each slice:
`sdd-spec` and `sdd-design` (parallelizable) → `sdd-tasks` → `sdd-apply` →
`sdd-verify`. The Review Workload Guard should watch PR2 for the 400-line budget
and apply the Notification-migration split if needed.
