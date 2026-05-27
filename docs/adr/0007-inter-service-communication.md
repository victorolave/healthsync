# 7. Inter-service communication

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** victorolave

## Context and Problem Statement

[ADR-0006](./0006-distributed-architecture.md) split HealthSync into a **Language service (FastAPI)**, a **Scheduling service (NestJS)**, and a **single frontend**. That leaves two boundaries to define:

1. **Frontend ↔ Scheduling (NestJS)** — how the doctor's app sends actions and receives live updates.
2. **Scheduling (NestJS) ↔ Language (FastAPI)** — how NestJS gets a message interpreted.

The second boundary is the real question. The flow is: NestJS sends the doctor's message → Language returns a structured intent → NestJS computes the [Plan](./0004-plan-as-unit-of-change.md). **The doctor is waiting** — this is request/response by nature.

## Decision Drivers

- The interpret → plan flow is **synchronous**: the doctor waits for the proposed plan.
- The **simplest, most teachable** contract between Python and Node, for a workshop introducing inter-service communication.
- Keep the Language service (FastAPI) **internal** — not exposed to the browser.
- Provide **real-time** delivery for "plan ready" and patient notifications.

## Considered Options (Scheduling ↔ Language)

- **A. Synchronous REST (HTTP + JSON).**
- **B. gRPC** (typed, protobuf).
- **C. Asynchronous messaging** (queue / events).

## Decision Outcome

Chosen: **A. Synchronous REST (HTTP + JSON)** between the services, with the following shape:

- **Scheduling (NestJS) ↔ Language (FastAPI):** a synchronous `HTTP POST /interpret` — NestJS sends the message (plus context), FastAPI returns the structured intent. NestJS then plans.
- **NestJS is the Backend-for-Frontend (BFF):** the frontend's **only** backend. The Language service stays **internal** behind NestJS, never called from the browser.
- **Frontend ↔ NestJS:** **REST** for commands (send message, confirm plan) plus a **real-time push channel** (WebSocket or SSE) for "plan ready" and patient notifications. *(The specific real-time transport is settled in ADR-0008 / at implementation.)*

```
[ Frontend ]
   │  REST (commands) + real-time (push)
   ▼
[ NestJS ]  BFF + scheduling + notifications
   │  POST /interpret   (sync HTTP+JSON)
   ▼
[ FastAPI ]  language understanding   (internal)
```

**gRPC** and **asynchronous eventing** remain on the radar as later upgrades (typed contracts; decoupling/resilience), but neither is justified for the synchronous interpret → plan flow today.

### Consequences

- **Good**, because REST matches the request/response nature of interpretation and is the most universal, teachable Python ↔ Node contract — ideal for the workshop's goal.
- **Good**, because the BFF shape keeps the frontend simple (one backend) and the Language service internal (smaller attack surface).
- **Good**, because real-time push gives the doctor and patients immediate feedback without polling.
- **Bad**, because synchronous coupling means a slow or unavailable Language service directly blocks the doctor's flow — timeouts, retries, and a fallback must be designed.
- **Neutral**, because the REST contract is untyped at the boundary; a shared schema (e.g., an agreed intent payload) must be maintained by convention across the two languages.

## Pros and Cons of the Options

### A. Synchronous REST (HTTP + JSON)
- Good: fits the synchronous flow; simplest and most teachable; trivial in both Python and Node.
- Bad: temporal coupling; no typed contract out of the box.

### B. gRPC
- Good: typed protobuf contract; binary and fast.
- Bad: requires `.proto` definitions and codegen in both languages — more setup than a workshop intro needs.

### C. Asynchronous messaging
- Good: decouples the services; improves resilience.
- Bad: the synchronous interpret → plan flow does not benefit; adds correlation and waiting — solving a problem we do not have yet.

## References

- [ADR-0006](./0006-distributed-architecture.md) — the services this connects.
- [ADR-0004](./0004-plan-as-unit-of-change.md) — NestJS computes the Plan after interpretation.
- [PRD](../PRD.md) — D1 (confirm gate), D3 (in-app channel), §9 (near real-time).
- Builds on this decision: ADR-0008 — frontend framework and remaining stack *(pending)*.
