# 12. Real-time transport

- **Status:** Accepted
- **Date:** 2026-05-28
- **Deciders:** victorolave

## Context and Problem Statement

[ADR-0007](./0007-inter-service-communication.md) settled that the frontend talks to NestJS over **REST for commands** plus a **real-time push channel**, and deferred the transport choice to here.

The Scheduling service (NestJS) pushes two kinds of update to the frontend: **"plan ready"** (after a message is interpreted and a plan computed) and **patient notifications** (when changes are applied). Because the doctor's commands already travel over REST, the real-time channel is **mostly server → client (push)**, not full-duplex. Which transport do we use?

## Decision Drivers

- The dominant pattern is **server → client push** (plan-ready, notifications).
- Commands already live on REST ([ADR-0007](./0007-inter-service-communication.md)) — bidirectionality is not required by the flow.
- "Near real-time" delivery ([PRD §9](../PRD.md)).
- Simplicity for the workshop.

## Considered Options

- **A. Server-Sent Events (SSE).**
- **B. WebSocket.**
- **C. Polling.**

## Decision Outcome

Chosen: **A. Server-Sent Events (SSE).**

NestJS exposes an SSE stream that pushes events (`plan-ready`, `notification`) to the frontend over plain HTTP. The client → server direction stays on REST ([ADR-0007](./0007-inter-service-communication.md)).

- SSE matches the actual need — unidirectional push — without the weight of a full-duplex protocol.
- It brings **automatic reconnection** out of the box and travels over plain HTTP through the NestJS BFF with no extra protocol surface.

WebSocket would be bringing a full-duplex hammer to a one-directional nail; it is justified only if the flow needed low-latency bidirectional exchange, which it does not.

### Consequences

- **Good**, because the transport matches the push-only need, keeping the real-time layer simple.
- **Good**, because built-in reconnection and plain HTTP reduce client and infrastructure complexity (no separate WebSocket server/upgrade path).
- **Bad**, because SSE is unidirectional — any future low-latency client → server need would require adding WebSocket later.
- **Neutral**, because over HTTP/1.1 a browser limits concurrent connections per origin; HTTP/2 (or a single shared stream) avoids the limit. Not a concern at MVP scale.

## Pros and Cons of the Options

### A. Server-Sent Events (SSE)
- Good: fits push-only; simple; automatic reconnection; plain HTTP through the BFF.
- Bad: unidirectional (acceptable, since commands are REST).

### B. WebSocket
- Good: full-duplex, low-latency, chat-native.
- Bad: heavier — connection lifecycle and scaling — more than a push channel needs.

### C. Polling
- Good: simplest; no persistent connection.
- Bad: latency and wasted requests; not truly real-time — fights the §9 near-real-time goal.

## References

- [ADR-0007](./0007-inter-service-communication.md) — REST for commands + a real-time push channel (resolved here).
- [ADR-0006](./0006-distributed-architecture.md) — NestJS is the frontend's backend.
- [PRD](../PRD.md) — §9 (near real-time), D3 (in-app notifications).
