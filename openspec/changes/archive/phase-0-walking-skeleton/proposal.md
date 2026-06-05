# Proposal: Phase 0 — Walking Skeleton

## Intent

HealthSync is a **distributed**, polyglot system (ADR-0006): web → NestJS BFF →
FastAPI, with Postgres behind NestJS. In such a system the primary risk is not
domain logic — it is the **integration between services** (BUILD-PLAN §"Walking
skeleton first", Cockburn). Build a thin, end-to-end slice that crosses all three
apps and touches Postgres while containing **zero domain logic**, so every
inter-service contract (ADR-0007, ADR-0011) is proven now, when changing it is
cheap — not in Phase 4. Success = a doctor's message typed in the web UI
round-trips web → scheduling → language → scheduling → web and renders, and
scheduling proves it can reach Postgres.

## Scope

### In Scope
- `web`: input + button that POSTs a message to scheduling over REST; renders the returned intent.
- `scheduling` (NestJS BFF): inbound REST endpoint that calls language `POST /interpret` over sync HTTP+JSON (ADR-0007), returns the result to web.
- `language` (FastAPI): `POST /interpret` returning a **hard-coded** intent — a `DELAY` placeholder (BUILD-PLAN "one DELAY carried through").
- `scheduling`: a trivial Postgres query (e.g. `SELECT 1`) proving the persistence path is wired (ADR-0011) — connection only.
- Local run wiring: web→scheduling and scheduling→language URLs; scheduling→Postgres connection config for `make dev` and docker-compose.

### Out of Scope
- Domain model — Agenda, Plan, planners, `recalculate` (Phase 1).
- Real NLU / LLM — intent stays hard-coded (Phase 3).
- Persistence schema, migrations, domain tables (Phase 2). Connectivity only.
- SSE / real-time, propose-and-confirm, notifications (Phase 4).
- Authentication, `CANCEL_BLOCK`, clarification (Phase 5).

## Capabilities

### New Capabilities
- `interpret-pipeline`: the end-to-end message round-trip across web → scheduling → language and back, returning a hard-coded DELAY intent.
- `persistence-connectivity`: scheduling proves it can connect to Postgres via a trivial query (no schema).

### Modified Capabilities
- None.

## Approach

Thinnest viable slice. Each service exposes exactly one new path and nothing
more. `language` returns a static DELAY payload — the same intent shape every
later phase fleshes out (no throwaway code). `scheduling` orchestrates one
outbound call to language and one trivial DB probe, then returns to web.
Keep the intent payload shape deliberate (intent + params) so it survives into
Phase 3; everything else stays a stub.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web` | Modified | Message input + POST to scheduling; render result |
| `apps/scheduling` | Modified | Inbound REST + language client + Postgres probe |
| `apps/language` | Modified | `POST /interpret` returning hard-coded DELAY |
| `docker-compose.yml` / `Makefile` | Modified | Wire service URLs + scheduling→Postgres config |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CORS blocks web→scheduling (different ports: 5173 → 3000) | High | Enable CORS in NestJS for the web origin in dev |
| Postgres unavailable under `make dev` (it lives only in docker-compose, not the Makefile dev path) | High | Decide local Postgres source: add a `db` target/compose-up step or document running compose's postgres alongside `make dev`; use a single connection string env var |
| Service URLs hard-coded vs env (docker DNS names vs localhost) | Med | Use env vars: `LANGUAGE_URL`, scheduling base URL, `DATABASE_URL` resolved per environment |
| Intent payload shape drifts before Phase 3 | Low | Agree on intent + params shape now; keep it stable |

## Rollback Plan

Each app's change is additive (one new path/handler). Revert is per-app: drop the
new endpoint/handler and the wiring commits. No schema or migration is created, so
there is nothing to undo in Postgres. Reverting the change-set restores the
health-check-only scaffold.

## Dependencies

- Monorepo scaffold with the three apps answering health checks (done).
- Postgres reachable locally — via docker-compose's `postgres` service.

## Success Criteria

- [ ] A message typed in the web UI round-trips web → scheduling → language → scheduling → web and the hard-coded DELAY intent renders.
- [ ] `scheduling` successfully executes a trivial query against Postgres (`SELECT 1`) on the request path or at startup.
- [ ] All three services run together via `make dev` (with Postgres) and via docker-compose.
- [ ] No domain logic, schema, or LLM introduced — contracts only.
