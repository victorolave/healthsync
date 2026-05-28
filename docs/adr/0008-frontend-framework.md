# 8. Frontend framework

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** victorolave

## Context and Problem Statement

[ADR-0006](./0006-distributed-architecture.md) defined a **single frontend backed by the Scheduling service (NestJS)**, and [ADR-0007](./0007-inter-service-communication.md) made NestJS the **Backend-for-Frontend** (the frontend's only backend; FastAPI stays internal). Which frontend framework do we use?

There is a subtle but important constraint: if the frontend brings its **own server layer** (as Next.js or Nuxt do), that layer overlaps the NestJS BFF and blurs the very thing the workshop is meant to teach — separate services with clear boundaries.

## Decision Drivers

- The frontend should be a **pure client (SPA)** so NestJS remains the single backend — no second server layer competing with the BFF.
- **TypeScript across the whole non-Python side** (NestJS + frontend) — consistency and teachability.
- The most **popular and teachable** option for a senior-developer workshop.
- Good support for a **conversational (chat) UI** and **real-time** updates.

## Considered Options

- **A. React + Vite (SPA)**
- **B. Angular (SPA)**
- **C. Vue + Vite (SPA)**
- **D. Next.js (meta-framework)**

## Decision Outcome

Chosen: **A. React + Vite (SPA).**

The frontend is a **pure client**: it talks to NestJS over REST for commands and over a real-time channel for "plan ready" and patient notifications ([ADR-0007](./0007-inter-service-communication.md)). It runs no server of its own, so NestJS stays unambiguously THE backend.

- **Vite** for a fast dev/build SPA with no SSR server.
- **React + TypeScript**, unifying the non-Python side of the stack with NestJS.

### Consequences

- **Good**, because the architecture stays crisp: one frontend (client) + two backend services, exactly the boundary the workshop teaches.
- **Good**, because TypeScript spans NestJS and the frontend, so contracts and mental models carry across.
- **Good**, because React is the most widely known choice for the audience, with abundant chat-UI and real-time examples.
- **Bad**, because React is a library, not a batteries-included framework: routing, state, and data-fetching libraries must be chosen separately (deferred to implementation).
- **Neutral**, because rendering is client-side only; this product is an authenticated app with no SEO needs, so SSR is not missed.

## Pros and Cons of the Options

### A. React + Vite (SPA)
- Good: most popular and teachable; pure client; TypeScript end-to-end with NestJS; huge ecosystem.
- Bad: requires assembling routing/state/data-fetching libraries.

### B. Angular (SPA)
- Good: conceptual symmetry with NestJS (dependency injection, decorators); batteries included.
- Bad: heavy and opinionated for a single-doctor MVP.

### C. Vue + Vite (SPA)
- Good: clean developer experience; gentle learning curve; also a pure client.
- Bad: smaller ecosystem than React among the senior-developer audience.

### D. Next.js
- Good: very popular; full-stack capabilities.
- Bad: its server layer overlaps the NestJS BFF, breaking the clean "two services + one frontend" boundary this project is built to teach. Rejected for that reason.

## References

- [ADR-0006](./0006-distributed-architecture.md) — single frontend backed by NestJS.
- [ADR-0007](./0007-inter-service-communication.md) — REST + real-time to NestJS; FastAPI internal.
- [PRD](../PRD.md) — D3 (in-app channel).
