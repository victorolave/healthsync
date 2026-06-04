# 2. Hexagonal architecture (ports & adapters)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** victorolave

## Context and Problem Statement

HealthSync needs a structural style before the first module is written. The [PRD](../PRD.md) imposes strong shape constraints:

- **Channel-agnostic** intake and notification — in-app today (D3), more channels on the radar (§8).
- **Language understanding separable** from the scheduling logic (§8).
- **Intents open for extension** (§8).
- **Propose-and-confirm** (D1): the domain computes a *plan* that exists independently of any delivery mechanism.
- The **technology stack is deliberately deferred** — we want to choose it later, against the architecture, not the other way around.

What architectural style should anchor the codebase so the valuable, hard logic stays isolated and the technology choices stay deferrable and swappable?

## Decision Drivers

- Isolate the **scheduling domain** (the hard, valuable logic) from external concerns: chat channel, language understanding, persistence, notification transport.
- **Defer and later swap** technology choices without rewriting the core.
- **Testability**: validate the domain without a UI, without a real language-understanding provider, and without a database.
- Serve as a **clear teaching artifact** for senior developers — the structure should communicate intent.
- **Do not over-engineer** a single-doctor MVP into unusable ceremony.

## Considered Options

- **A. Hexagonal (Ports & Adapters)**
- **B. Clean / Layered (concentric, dependency rule)**
- **C. Pragmatic modular (MVC: controllers / services / repositories)**

## Decision Outcome

Chosen: **A. Hexagonal (Ports & Adapters)**, because the PRD's constraints *are* ports. Channel-agnostic intake and notification, a swappable language-understanding provider, and deferred persistence map one-to-one onto ports with interchangeable adapters. Hexagonal is therefore not over-engineering here — it is the natural fit, and it is precisely what lets us defer the stack (which we are doing on purpose).

The domain (agenda, plan, scheduling rules) sits at the center with **no dependency on any technology**. External systems sit behind **ports** (interfaces owned by the domain) and are implemented by **adapters** (in-app chat, language understanding, persistence, notification transport). Dependencies point **inward**, toward the domain.

> Scope note: this ADR decides the *style* only. The concrete **bounded contexts and module boundaries** — and whether we adopt a *screaming* (domain-first) folder organization — are decided in **ADR-0003**.

### Consequences

- **Good**, because the scheduling domain becomes testable in isolation, with no UI, no real language provider, and no database.
- **Good**, because channels, language understanding, persistence, and notification become swappable adapters — directly enabling the §8 "open door" and the deliberate deferral of the stack.
- **Good**, because the structure itself documents the architecture, which is valuable for the workshop audience.
- **Bad**, because ports-and-adapters indirection is more upfront structure than a single-doctor MVP strictly needs; applied dogmatically to trivial parts it can add noise.
- **Neutral**, because hexagonal and Clean share the same dependency-inward principle; we choose the ports-and-adapters framing over concentric layers, but a later move between the two would not be a rewrite.

## Pros and Cons of the Options

### A. Hexagonal (Ports & Adapters)
- Good: the PRD constraints (channel, language understanding, persistence, notification) are literally ports.
- Good: defers the technology stack by design; domain testable in isolation.
- Bad: more initial structure; requires discipline around the ports/adapters boundary.

### B. Clean / Layered (concentric)
- Good: explicit dependency rule; a use-case layer maps cleanly to the PRD scenarios.
- Bad: a close cousin of hexagonal with more ceremony; risk of anemic layers if applied mechanically.

### C. Pragmatic modular (MVC)
- Good: fast, low ceremony, universally familiar.
- Bad: domain logic leaks into "services"; channel and language provider become hard to swap — it fights the PRD's channel-agnostic and separability requirements.

## References

- Alistair Cockburn, *Hexagonal Architecture (Ports and Adapters)*.
- [PRD](../PRD.md) — §8 Future Vision (open-door design implications), decision D1 (propose-and-confirm), D3 (in-app channel).
- Builds on this decision: [ADR-0003](./0003-bounded-contexts.md) — bounded contexts & module organization.
