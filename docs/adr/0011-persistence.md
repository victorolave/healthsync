# 11. Persistence

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** victorolave

## Context and Problem Statement

The Scheduling service (NestJS, [ADR-0006](./0006-distributed-architecture.md)) needs durable state: the **agenda and appointments**, the **change history** ([PRD §4.7](../PRD.md)), and possibly the **pending plan** awaiting confirmation ([ADR-0004](./0004-plan-as-unit-of-change.md), [D1](../PRD.md)). The Language service is effectively **stateless** — it interprets messages and owns no durable data — so this is a Scheduling-service concern.

Because persistence is an **adapter behind a port** ([ADR-0002](./0002-hexagonal-architecture.md)), the choice is swappable and the domain does not depend on it — this is a lower-stakes, reversible decision. Which datastore do we use?

## Decision Drivers

- Scheduling data is **relational and integrity-sensitive**: appointments, working hours, no overlaps, no double-booking.
- It is an **adapter** (hexagonal) — swappable, domain-independent.
- **Workshop**: teachable and runnable through the monorepo's `docker-compose` ([ADR-0009](./0009-monorepo-strategy.md)), with reasonable setup friction.
- The Language service is **stateless** — out of scope here.

## Considered Options

- **A. PostgreSQL** (relational).
- **B. SQLite** (embedded relational).
- **C. MongoDB** (document).

## Decision Outcome

Chosen: **A. PostgreSQL**, behind the Scheduling service's persistence port.

- Scheduling data is naturally relational; **integrity constraints** (uniqueness, exclusion over time ranges) enforce "no double-booking" at the database rather than only in code.
- It runs as a service in the monorepo's `docker-compose` ([ADR-0009](./0009-monorepo-strategy.md)), so "clone and go" still holds.
- It sits behind the persistence port, so swapping it later is an adapter change, not a domain change.

Whether the **pending plan** (awaiting confirmation) is persisted or held in session memory is an **implementation detail** deferred to build time; the durable record of agenda, appointments, and history is what this decision commits to.

### Consequences

- **Good**, because relational constraints make scheduling integrity (no overlaps) a first-class, enforced property — a strong teaching point.
- **Good**, because it is representative of production and runs cleanly in the existing `docker-compose`.
- **Good**, because the port keeps it swappable, so the decision stays low-risk.
- **Bad**, because it adds one more container to run locally versus an embedded file database.
- **Neutral**, because an ORM/query-layer choice within NestJS is left to implementation.

## Pros and Cons of the Options

### A. PostgreSQL
- Good: relational fit; integrity via constraints; production-representative; runs in docker-compose.
- Bad: one more container to run.

### B. SQLite
- Good: zero external service; file-based; simplest setup.
- Bad: less representative of a production environment.

### C. MongoDB
- Good: flexible document schema.
- Bad: scheduling is relational and integrity-heavy; preventing overlapping appointments becomes the application's responsibility rather than the database's — a weaker fit.

## References

- [ADR-0002](./0002-hexagonal-architecture.md) — persistence is an adapter behind a port.
- [ADR-0004](./0004-plan-as-unit-of-change.md) — the Plan and applied changes are what gets persisted.
- [ADR-0006](./0006-distributed-architecture.md) — the Scheduling service (NestJS) owns this.
- [ADR-0009](./0009-monorepo-strategy.md) — Postgres runs in the monorepo's docker-compose.
- [PRD](../PRD.md) — §4.7 (history & audit).
- Builds on this batch: [ADR-0012](./0012-realtime-transport.md) — real-time transport.
