# 9. Repository strategy: lightweight monorepo

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** victorolave

## Context and Problem Statement

[ADR-0006](./0006-distributed-architecture.md) produced three deployables — the Language service (FastAPI), the Scheduling service (NestJS), and the web frontend (React). This repository already holds the shared documentation (`docs/`: the PRD and these ADRs), so it is effectively a monorepo seed.

Do the three deployables live **together in one repository (monorepo)** or in **separate repositories (polyrepo)** — and, if together, with what layout and tooling?

## Decision Drivers

- **Workshop first:** participants should clone **once** and see the whole system; navigation and onboarding dominate.
- **Atomic cross-service changes:** the `/interpret` contract ([ADR-0007](./0007-inter-service-communication.md)) spans FastAPI and NestJS; changing it in a **single PR** is a valuable teaching moment.
- **Polyglot:** Python and Node/TypeScript toolchains must coexist without fighting.
- **Unified docs:** the PRD and ADRs already live here.
- **No heavy machinery** a single-doctor MVP does not need.

## Considered Options

- **A. Lightweight monorepo** — one repo, a folder per deployable with each one's native tooling, plus `docker-compose` to run them together.
- **B. Polyrepo** — a separate repository per service and the frontend.
- **C. Monorepo with a managed tool** — Nx, Turborepo, or similar.

## Decision Outcome

Chosen: **A. Lightweight monorepo.**

```
healthsync/                  ← one repository
├─ apps/
│  ├─ language/      Language service — FastAPI (Python)
│  ├─ scheduling/    Scheduling service — NestJS (Node/TS)
│  └─ web/           Frontend — React + Vite
├─ docs/             PRD + ADRs (already here)
├─ docker-compose.yml   run all three locally
└─ README, LICENSE, .gitignore
```

- Each app keeps its **own native tooling** (Python's for `language/`, Node's for `scheduling/` and `web/`). The monorepo does not impose a shared package manager across languages.
- **`docker-compose`** is the one-command way to run the whole system locally — the workshop's "clone and go."
- **No Nx/Turborepo:** those are JavaScript-first; in a Python + Node repo the Python service would sit awkwardly outside their model. Plain folders keep every stack a first-class citizen.

### Consequences

- **Good**, because one clone exposes the entire system — services, frontend, and docs — which is exactly what the workshop needs.
- **Good**, because a change to the inter-service contract can land in a single atomic PR across both services.
- **Good**, because it continues what the repo already is (docs live here), avoiding the churn of splitting into multiple repos.
- **Good**, because each language keeps its idiomatic tooling — no polyglot tool forcing a lowest common denominator.
- **Bad**, because CI must handle multiple stacks in one pipeline, and the repo carries two toolchains.
- **Neutral**, because module boundaries are still enforced by discipline and review; a monorepo makes it *easy* to cross boundaries, so the contracts from ADR-0006/0007 must be respected deliberately.

## Pros and Cons of the Options

### A. Lightweight monorepo
- Good: one clone; atomic cross-service changes; docs beside code; each stack first-class.
- Bad: multi-stack CI; two toolchains in one repo.

### B. Polyrepo
- Good: full isolation; independent CI, deploy, and versioning per repo.
- Bad: cross-service changes span repos; harder to navigate; the workshop fragments; the shared docs need a home.

### C. Monorepo with a managed tool (Nx/Turborepo)
- Good: build graph and caching for larger codebases.
- Bad: JavaScript-first — the Python service falls outside the tool's model; more machinery than this MVP needs.

## References

- [ADR-0001](./0001-record-architecture-decisions.md) — ADRs already live in this repo's `docs/`.
- [ADR-0006](./0006-distributed-architecture.md) — the three deployables this repo hosts.
- [ADR-0007](./0007-inter-service-communication.md) — the cross-service contract that benefits from atomic changes.
- [ADR-0008](./0008-frontend-framework.md) — the web app under `apps/web`.
