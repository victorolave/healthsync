# interpret-pipeline — Phase 3 Delta Spec

## Purpose of This Delta

This file records ONLY the changes Phase 3 makes to the `interpret-pipeline`
specification. All requirements defined in
`openspec/specs/interpret-pipeline/spec.md` remain in force unless explicitly
superseded here.

**Single change:** The "Language returns hard-coded DELAY intent" requirement is
retired and replaced by "Language interprets the message via an LLM". The HTTP
envelope is unchanged. Everything else in the canonical spec is stable.

---

## Superseded requirement

The following requirement from the canonical `interpret-pipeline` spec is
**replaced** as of Phase 3:

> ### Requirement: Language returns hard-coded DELAY intent (stable, Phase 0+)
> `language` MUST expose `POST /interpret` accepting `{ "message": string }`.
> It MUST return a hard-coded `DELAY` intent regardless of the message content.

That requirement is no longer valid. The scenarios under it (hard-coded
`minutes: 15`, `confidence: 1.0` for every input) are retired.

The row `language returns hard-coded DELAY | language | Manual / curl smoke test | 0+`
in the Test Runner Notes table is also retired and replaced by the rows introduced
in the `language-nlu` spec.

---

## Replacement requirement: Language interprets the message via an LLM (Phase 3+)

`language` MUST expose `POST /interpret` accepting `{ "message": string }`.

The **HTTP envelope is unchanged** and MUST remain stable through all future phases:

```json
{
  "intent": { "kind": "DELAY", "params": { "minutes": <int> } },
  "confidence": <float 0..1>
}
```

- `intent.kind` MUST be UPPERCASE (ADR-0005). The only supported kind in Phase 3
  is `"DELAY"`. Any other kind returned by the LLM MUST be rejected — see the
  `language-nlu` spec for the full validation contract.
- `intent.params.minutes` MUST be a positive integer derived from the LLM result,
  not a hard-coded constant.
- `confidence` MUST be the self-reported float returned by the LLM, passed through
  unchanged. It MUST NOT be hard-coded to `1.0` after Phase 3.
- The service MUST never return HTTP 200 with a fabricated or coerced intent. If
  the LLM result is off-schema or the LLM is unavailable, the service MUST return
  an error response — see `language-nlu` spec §Error and HTTP semantics.

The `scheduling` adapter MUST NOT change. It already maps any non-2xx response from
`language` to `503 language_unavailable`. That behavior is unchanged.

### Scenario: /interpret returns an LLM-derived DELAY intent for a concrete message

- GIVEN `language` is running and the LLM is reachable
- WHEN `POST /interpret` receives `{ "message": "llego 40 minutos tarde" }`
- THEN the response status is 200
- AND the response body matches `{ "intent": { "kind": "DELAY", "params": { "minutes": 40 } }, "confidence": <float> }`
- AND `confidence` is a float in [0, 1], not hard-coded to 1.0

### Scenario: /interpret rejects a missing message field (unchanged)

- GIVEN `language` is running
- WHEN `POST /interpret` receives a body without the `message` field
- THEN the response status is 422 (Unprocessable Entity)

(This scenario is unchanged from the canonical spec; it is repeated here for
completeness of the Phase 3 delta.)

---

## Test Runner Notes update

Phase 3 adds automated test coverage for `language` via pytest. The Test Runner
Notes table in the canonical spec is extended as follows (additions only):

| Requirement | Target app | Automatable now | Phase |
|---|---|---|---|
| Language interprets message via LLM (fake) | `language` | Yes — pytest (FakeInterpreter) | 3+ |
| Language rejects off-schema LLM output | `language` | Yes — pytest (FakeInterpreter) | 3+ |
| Language returns 503 when LLM unavailable | `language` | Yes — pytest (FakeInterpreter) | 3+ |
| Language live round-trip (real LLM) | `language` | Yes — pytest (self-skips without key) | 3+ |

---

## Deferred update

The deferred entry `real-nlu — Real Language NLU replaces the hardcoded DELAY stub
in Phase 3` in the canonical spec is now fulfilled. It MUST be removed from the
Deferred section when the canonical spec is next updated.

---

## Stability anchor

The following properties of `interpret-pipeline` are LOCKED and MUST NOT change in
Phase 3 or any subsequent phase without an explicit delta spec:

- Endpoint path: `POST /interpret`
- Request body shape: `{ "message": string }`
- Response envelope: `{ "intent": { "kind": string, "params": object }, "confidence": number }`
- `scheduling` calling convention: synchronous HTTP+JSON, reads `{ intent, confidence }`
- `scheduling` error mapping: any non-2xx → `503 language_unavailable`
