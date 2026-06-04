# 13. Patient notification lifecycle: acknowledgement, fallback & response

- **Status:** Accepted
- **Date:** 2026-06-03
- **Deciders:** victorolave

## Context and Problem Statement

[ADR-0012](./0012-realtime-transport.md) chose SSE as the real-time transport: server → client, push-only, unidirectional. That decision settled *how* notifications reach the patient's in-app client ([D3](../PRD.md)).

But the [PRD](../PRD.md) requires more than fire-and-forget delivery. The Scheduling service (NestJS, [ADR-0006](./0006-distributed-architecture.md)) must not only *send* a notification — it must know it was received, react when it was not, and capture the patient's response:

- **§7 (Should-have) and §10 (Risk: notification failure):** "Notification delivery confirmation and fallback" — a patient who is not effectively reached has not been notified.
- **§9 (Success):** "no impacted patient is ever left un-notified" — completeness must be a *verifiable* property, not an assumption.
- **§4.5:** a notification states "what they can do (confirm, request a different time)."
- **Scenario 4 (EARLY) + §7 (Should):** "Patient accept/decline on 'come earlier'."
- **§8 (open door):** "Model the patient as an active participant, not only a recipient."

[ADR-0012](./0012-realtime-transport.md) settled the push channel. It left open the questions of acknowledgement, fallback, and patient response. That is the gap this ADR closes.

The tension to resolve: how to add acknowledgement and a patient response channel WITHOUT contradicting ADR-0012's push-only stance?

## Decision Drivers

- **Notification completeness (§9):** no patient left un-notified requires knowing whether the message actually arrived.
- **Channel is in-app (D3):** the patient's client is present and can acknowledge receipt.
- **Model the patient as an active participant (§8):** the patient does more than read.
- **Coherence with existing decisions:** client → server is REST ([ADR-0007](./0007-inter-service-communication.md)), durable state lives behind the persistence port ([ADR-0011](./0011-persistence.md)), push is SSE ([ADR-0012](./0012-realtime-transport.md)), the doctor confirms the plan ([D1](../PRD.md)).
- Workshop simplicity.

## Considered Options

- **A. Notification as a stateful, persisted entity** — pushed via SSE, acknowledged and responded-to via REST, its state persisted; fallback driven by an acknowledgement timeout.
- **B. Fire-and-forget SSE** (the status quo of ADR-0012 alone) — no acknowledgement.
- **C. Full-duplex WebSocket** for the whole notification exchange.

## Decision Outcome

Chosen: **A. The notification is a stateful entity** owned by the Scheduling service and persisted ([ADR-0011](./0011-persistence.md)), moving through a lifecycle:

```
PENDING → SENT → DELIVERED → READ → RESPONDED (ACCEPTED | DECLINED)
            │
            └─ no acknowledgement within window → EXPIRED / FAILED  (fallback path)
```

- **Push (out):** SSE pushes the notification to the patient's client — [ADR-0012](./0012-realtime-transport.md) unchanged.
- **Delivery confirmation (in):** the in-app client (D3) confirms receipt and read with a REST call ([ADR-0007](./0007-inter-service-communication.md)), advancing the state to `DELIVERED` / `READ`. On an in-app channel, "delivered" means the client acknowledged receipt.
- **Fallback:** if no acknowledgement arrives within a configured window, the notification is flagged for escalation — for review by the doctor, the future coordinator role (§8), or a retry. This makes "no patient left un-notified" (§9) a verifiable, persistent property rather than an assumption.
- **Patient response (accept/decline, Scenario 4 EARLY):** a REST client → server action ([ADR-0007](./0007-inter-service-communication.md)), NOT WebSocket. This *reaffirms* [ADR-0012](./0012-realtime-transport.md) — the push channel stays unidirectional; the patient's response travels on the same REST command channel the doctor's commands already use. For the EARLY scenario, `ACCEPTED` triggers recalculation of that patient's slot; `DECLINED` leaves the original time intact.
- **Relationship to D1:** the doctor has already confirmed the *plan*; the patient's response acts only on their own appointment within that already-approved plan, so it does not bypass the D1 gate.

**Scope note:** the concrete fallback mechanism (retry cadence, escalation path to the future coordinator, timeout window) and the coordinator role (§8) are implementation details deferred to build time. This ADR fixes the *model* — a stateful notification with REST acknowledgement and response — not those values.

### Consequences

- **Good**, because §9 completeness becomes a verifiable, auditable property (persisted lifecycle state), not an assumption.
- **Good**, because the patient is modelled as an active participant (§8) without introducing WebSocket — this decision *reaffirms* ADR-0012 instead of contradicting it.
- **Good**, because accept/decline reuses the existing REST command channel ([ADR-0007](./0007-inter-service-communication.md)) — zero new protocol surface.
- **Good**, because notification state fits the already-chosen persistence ([ADR-0011](./0011-persistence.md)) and naturally feeds history and audit (§4.7).
- **Bad**, because it adds lifecycle states and endpoints to maintain; the real fallback behavior depends on a coordinator role that is still future (§8).
- **Neutral**, because on an in-app channel, "delivered" means the client acknowledged receipt — it does not guarantee a human read the message, only that the client received it. This is an honest limitation of any in-app channel.

## Pros and Cons of the Options

### A. Stateful persisted notification
- Good: completeness becomes verifiable; patient becomes an active participant; reuses REST and persistence; no new protocol surface.
- Bad: more lifecycle states and endpoints to maintain.

### B. Fire-and-forget SSE
- Good: simplest — nothing to add beyond ADR-0012.
- Bad: violates §9 (cannot tell whether a patient was reached); provides no path for accept/decline.

### C. Full-duplex WebSocket
- Good: bidirectional out of the box.
- Bad: [ADR-0012](./0012-realtime-transport.md) already argued this is a full-duplex hammer for a push-only nail; accept/decline is ordinary request/response and does not benefit from a persistent bidirectional stream.

## References

- [ADR-0002](./0002-hexagonal-architecture.md) — notifications and persistence are adapters behind ports.
- [ADR-0007](./0007-inter-service-communication.md) — REST is the client → server channel used for acknowledgement and patient response.
- [ADR-0011](./0011-persistence.md) — notification lifecycle state is persisted; it also feeds history and audit.
- [ADR-0012](./0012-realtime-transport.md) — SSE push (reaffirmed here, not contradicted).
- [PRD](../PRD.md) — §4.5 (what the patient can do), §7 (Should: delivery confirmation + accept/decline), §8 (patient as active participant), §9 (notification completeness), §10 (risk: notification failure), Scenario 4 (EARLY).
