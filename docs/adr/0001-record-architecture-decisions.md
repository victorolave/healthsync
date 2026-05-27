# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** victorolave

## Context and Problem Statement

HealthSync has just locked its product definition (the [PRD](../PRD.md)) and is about to make a series of architectural and technical decisions. Without a durable record of *why* each decision was made — the context, the alternatives weighed, the trade-offs accepted — that reasoning evaporates. Months later nobody remembers why a boundary was drawn where it was, and decisions get silently re-litigated or accidentally reversed.

The project is also **educational** (a Dev Senior Code workshop) and **open to future extension**. Both audiences — workshop participants and future maintainers — need to follow not just *what* was decided, but *why*.

How do we capture architectural decisions so the reasoning survives the people who made it?

## Decision Drivers

- Decisions must be traceable to their **context** and **rejected alternatives**, not just their outcome.
- The record must be **lightweight enough** that we actually keep it up to date.
- It must **live with the code** (versioned in git) and be reviewable through the same flow as code.
- It must be readable by **humans and by AI tooling** used to scaffold the project.
- It must stay **separate from product decisions**, which already live in the PRD.

## Considered Options

- Architecture Decision Records (ADRs) in the repository
- A single growing "architecture decisions" page
- A decisions log in an external tool (wiki, Notion, issue tracker)
- No formal record (rely on commit messages and memory)

## Decision Outcome

Chosen: **Architecture Decision Records (ADRs) in the repository**, using the **MADR** template, stored as `docs/adr/NNNN-title.md`, written in English, **one decision per file**.

Conventions this establishes:

- An ADR records **exactly one architectural decision**.
- An ADR is **immutable once Accepted**. If a decision changes, we write a **new ADR that supersedes** the old one; the old one is marked `Superseded by [ADR-XXXX]` and **never deleted** — the history is the point.
- ADRs record **architecture** ("how we build it"). **Product** decisions stay in the [PRD](../PRD.md) ("what we build and why"). The two layers are never mixed.
- [`template.md`](./template.md) defines the MADR structure every ADR follows.
- Numbering is sequential, starting at `0001` (this file).

### Consequences

- **Good**, because the reasoning behind every architectural decision is preserved next to the code and reviewed through the same pull-request flow.
- **Good**, because the *Considered Options* and *Pros and Cons* sections force the trade-off analysis to be explicit — valuable as a teaching artifact.
- **Good**, because the immutable + supersede model gives an honest history of how the architecture evolved, rather than a doc that pretends the final answer was always obvious.
- **Bad**, because it adds a small, ongoing discipline cost: making a real decision now means writing a short document.
- **Neutral**, because numbering is manual and sequential; parallel drafts could collide on a number, resolved at review time.

## Pros and Cons of the Options

### Architecture Decision Records (ADRs) in the repository
- Good: versioned with the code; one decision per file; easy to review and to supersede.
- Good: industry-standard format, familiar to contributors.
- Bad: requires the discipline to keep writing them.

### A single growing "architecture decisions" page
- Good: everything in one place.
- Bad: grows unwieldy; hard to see when and why a single decision was made; constant merge conflicts.

### A decisions log in an external tool
- Good: rich editing and commenting.
- Bad: drifts out of sync with the code; not versioned alongside it; one more place to look.

### No formal record
- Good: zero overhead.
- Bad: the *why* is lost; decisions get re-litigated; effectively fatal for onboarding and for an educational project.

## References

- [MADR — Markdown Any Decision Records](https://adr.github.io/madr/)
- Michael Nygard, *Documenting Architecture Decisions* (the original ADR essay)
- Product decisions live in [`../PRD.md`](../PRD.md), not here.
