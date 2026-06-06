# web-ui Spec — Phase 4 FE-foundation (PR1)

One-sentence scope: the web app gains brand identity, a working chat input, and
display-only rendering of the `PlanResponseDto` returned by `POST /messages`,
un-breaking the frontend left broken by Phase 2.

**Slice**: FE-foundation (PR1 of 4).
**Out of scope**: Confirm button/flow, SSE / real-time notifications (FE-loop, PR4).

---

## Requirements

---

### REQ-UI-01 — Replace broken IntentResponse shape with PlanResponseDto

The web app currently imports and renders `IntentResponse` (`{ intent, confidence }`).
That type has been dead since Phase 2; the backend now returns `PlanResponseDto`.
`App.tsx` (or its successor) MUST be updated so that the TypeScript type used for
the POST /messages response matches the Phase 2 contract exactly:

```typescript
interface TimeSlotDto   { start: string; end: string }
interface PlanOperationDto {
  type: 'move';
  appointmentId: string;
  patientId: string;
  from: TimeSlotDto;
  to: TimeSlotDto;
}
interface ConflictDto {
  appointmentId: string;
  reason: 'OVERFLOWS_CLOSING';
  proposedSlot: TimeSlotDto;
}
interface PlanResponseDto {
  status: 'proposed';
  operations: PlanOperationDto[];
  conflicts:  ConflictDto[];
  confidence: number;
}
```

All references to `IntentResponse`, `intent.kind`, and `intent.params` MUST be removed.

#### Scenario: submitted message renders move operations from PlanResponseDto

- GIVEN the web app is loaded and `scheduling` is reachable
- AND the doctor's agenda exists for today
- WHEN the doctor types "llego 40 minutos tarde" and submits
- THEN the app POSTs `{ "message": "llego 40 minutos tarde" }` to `VITE_SCHEDULING_URL/messages`
- AND on a 200 response the app renders each entry in `operations[]` as a move card
- AND each card displays `patientId`, the `from` time (`HH:MM`), and the `to` time (`HH:MM`)
- AND no reference to `intent.kind` or `intent.params` appears in the rendered output

#### Scenario: TypeScript compilation succeeds with the new shape

- GIVEN the file referencing `IntentResponse` is deleted or replaced
- WHEN `pnpm -F web build` (or `tsc --noEmit`) is executed
- THEN the compilation exits with code 0
- AND no `TS2339` or `TS2345` errors reference `IntentResponse`

---

### REQ-UI-02 — HealthSync brand identity in the app shell

The app MUST render a top app bar that is visually consistent with the HealthSync
brand on every screen state (empty, loading, results, error).

Observable requirements:

- The `logo-horizontal.png` asset (from `assets/` copied to `apps/web/public/brand/`)
  appears in the top app bar in light mode.
- The `logo-dark.png` asset appears in the top app bar in dark mode.
- The `icon.png` asset is set as the page favicon (`<link rel="icon">`).
- The product name "HealthSync" is present in the `<title>` element.
- A dark-mode toggle control is visible and functional.
- The top app bar is visible on scroll (sticky or fixed positioning).

#### Scenario: light mode shows the horizontal logo

- GIVEN the system color scheme is light (or the user has toggled to light mode)
- WHEN the app renders
- THEN `logo-horizontal.png` is visible in the top app bar
- AND `logo-dark.png` is NOT rendered as the primary logo

#### Scenario: dark mode shows the dark logo

- GIVEN the user activates dark mode via the toggle
- WHEN the app re-renders
- THEN `logo-dark.png` is visible in the top app bar
- AND the background color of the app bar shifts to the deep-navy palette (`#001A3D` or the CSS custom property `--background` in dark mode)

#### Scenario: favicon is the HealthSync icon

- GIVEN the app HTML has loaded
- WHEN a browser tab is open
- THEN the tab favicon resolves to `icon.png`

---

### REQ-UI-03 — Brand typography and color palette

The CSS reset from `apps/web/src/index.css` (currently the purple accent theme)
MUST be replaced with the HealthSync token map.

Observable requirements:

- Font family for headings and nav: Figtree (weights 500/600/700).
- Font family for body and UI text: Inter (weights 400/500).
- Both fonts loaded via Google Fonts `display=swap` or self-hosted.
- Time values (`HH:MM`) rendered with tabular figures (font-variant-numeric: tabular-nums).
- CSS custom properties (`--primary`, `--accent`, `--foreground`, `--background`, etc.)
  match the finalized token map in LIGHT mode:
  `--primary #006CE4`, `--accent #00C0A8`, `--foreground #001A3D`, `--background #FFFFFF`.
- Same tokens in DARK mode: `--primary #2B86F0`, `--accent #19D6BB`,
  `--foreground #E8EEF6`, `--background #001A3D`.
- No purple, neon, or motion-heavy gradients anywhere in the UI.

#### Scenario: brand colors appear on the submit button in light mode

- GIVEN the web app is loaded in light mode
- WHEN the doctor views the chat input form
- THEN the submit button background color resolves to `--primary` (`#006CE4`)
- AND the button text color resolves to `--primary-foreground` (`#FFFFFF`)

#### Scenario: time values use tabular figures

- GIVEN a move operation card is rendered with times `09:05 → 09:45`
- WHEN the UI is inspected
- THEN the time strings are rendered with a font that uses tabular numeric spacing
  (font-variant-numeric: tabular-nums or equivalent)

---

### REQ-UI-04 — Chat input component

A prominent card-style input area MUST allow the doctor to type a Spanish-language
scheduling instruction and submit it.

Observable requirements:

- A text field is present and focused on page load (or focusable via Tab).
- A submit button (or Enter-key) triggers the POST request when the field is non-empty.
- An empty message field MUST NOT trigger a request; the submit control is visually disabled or inert.
- The input is disabled (non-interactive) while a request is in-flight.
- Placeholder text guides the doctor (e.g., "Contale qué pasó — reorganiza el resto").
- After a successful response, the input field is NOT cleared automatically — the
  doctor may want to see their original message alongside the plan.

#### Scenario: empty message is blocked

- GIVEN the web app is loaded with no message typed
- WHEN the doctor clicks the submit button or presses Enter
- THEN no HTTP request is made
- AND a visible cue indicates input is required (disabled state, aria-disabled, or an inline hint)

#### Scenario: in-flight message disables the input and submit control

- GIVEN the doctor has typed "llego 40 minutos tarde" and submitted
- AND the fetch request to `POST /messages` is still in-flight
- WHEN the UI is observed
- THEN the text field is in a disabled state (not editable)
- AND the submit button is in a disabled state (not clickable)

#### Scenario: VITE_SCHEDULING_URL is used for the POST target

- GIVEN `VITE_SCHEDULING_URL` is set to `http://staging.example.com`
- WHEN the doctor submits a message
- THEN the app POSTs to `http://staging.example.com/messages`
- AND NOT to any hardcoded localhost URL

---

### REQ-UI-05 — Proposed plan view: move operation cards

When the backend returns `status: 'proposed'` with one or more operations, the app
MUST render a card for each operation in `operations[]`.

Each card MUST display:

- The patient identifier (`patientId`).
- The FROM time slot (`from.start` – `from.end`, formatted as `HH:MM – HH:MM`).
- A directional arrow or sync icon conveying movement (e.g., an `ArrowLeftRight` or `→` symbol).
- The TO time slot (`to.start` – `to.end`, formatted as `HH:MM – HH:MM`).
- The appointment identifier (`appointmentId`) in a secondary/muted style.

The order of cards MUST follow the order of `operations[]` in the response.

#### Scenario: single-move plan renders one card with correct times

- GIVEN `POST /messages` returns:
  ```json
  {
    "status": "proposed",
    "operations": [{
      "type": "move",
      "appointmentId": "apt-1",
      "patientId": "patient-garcia",
      "from": { "start": "09:00", "end": "09:30" },
      "to":   { "start": "09:40", "end": "10:10" }
    }],
    "conflicts": [],
    "confidence": 0.95
  }
  ```
- WHEN the response is received and rendered
- THEN a card with "patient-garcia" is visible
- AND the card shows "09:00 – 09:30" as the original slot
- AND the card shows "09:40 – 10:10" as the new slot
- AND a sync/arrow icon appears between the two time ranges
- AND no conflict badge is shown

#### Scenario: multi-move plan renders one card per operation, in order

- GIVEN `operations[]` contains three entries (apt-1, apt-2, apt-3) in that order
- WHEN the response is rendered
- THEN three move cards appear in the DOM in the order apt-1, apt-2, apt-3
- AND no card is omitted or duplicated

#### Scenario: zero operations renders the empty state, not a blank area

- GIVEN `POST /messages` returns `{ "status": "proposed", "operations": [], "conflicts": [], "confidence": 0.85 }`
- WHEN the response is rendered
- THEN the ProposedPlanView area shows the empty-state UI (copy + muted icon)
- AND no move-operation cards are rendered

---

### REQ-UI-06 — Conflict badge for OVERFLOWS_CLOSING

When `conflicts[]` is non-empty, each conflict entry MUST be rendered as a visually
distinct badge or callout near the corresponding operation (or in a dedicated
"conflicts" section below the operations list).

Observable requirements:

- The badge uses a destructive/amber color (maps to `--destructive` `#DC2626` in light mode
  or `#F87171` in dark mode, or an amber warning variant).
- The badge text surfaces `reason: 'OVERFLOWS_CLOSING'` in a human-readable form
  (e.g., "Desborda el horario de cierre" or "Overflows closing time").
- The `proposedSlot` start and end times from the conflict are visible in or near the badge.
- The conflicting `appointmentId` is identifiable from the badge context.

#### Scenario: one conflict renders a distinct badge

- GIVEN `POST /messages` returns two operations and one conflict:
  ```json
  {
    "status": "proposed",
    "operations": [
      { "type": "move", "appointmentId": "apt-1", "patientId": "garcia",
        "from": { "start": "09:00", "end": "09:30" },
        "to":   { "start": "09:40", "end": "10:10" } },
      { "type": "move", "appointmentId": "apt-2", "patientId": "lopez",
        "from": { "start": "16:30", "end": "17:00" },
        "to":   { "start": "17:10", "end": "17:40" } }
    ],
    "conflicts": [{
      "appointmentId": "apt-2",
      "reason": "OVERFLOWS_CLOSING",
      "proposedSlot": { "start": "17:10", "end": "17:40" }
    }],
    "confidence": 0.88
  }
  ```
- WHEN the response is rendered
- THEN the "lopez" / apt-2 card (or a dedicated conflicts area) shows a destructive/amber badge
- AND the badge visually differs from the normal move-card styling
- AND the badge text communicates overflow or closing-time conflict
- AND the "garcia" / apt-1 card does NOT show a conflict badge

---

### REQ-UI-07 — Confidence display

The `confidence` value from `PlanResponseDto` MUST be visible in the plan view.

Observable requirements:

- Displayed as a percentage (e.g., `95%`) or a decimal (e.g., `0.95`).
- Positioned subtly — it must not dominate the visual hierarchy (muted color, small font).
- NOT shown while loading or in the empty state.

#### Scenario: confidence is rendered after a successful response

- GIVEN a 200 response with `confidence: 0.92`
- WHEN the plan is rendered
- THEN a UI element containing "92%" (or "0.92") is visible
- AND it uses a muted/secondary color (maps to `--muted-foreground`)

---

### REQ-UI-08 — Loading state: skeleton, not a blocking spinner

While the fetch to `POST /messages` is in-flight, the app MUST render a skeleton
placeholder in the plan area.

Observable requirements:

- The skeleton is rendered in the plan area immediately after submit (within the same render cycle).
- The skeleton uses the shadcn `Skeleton` component (or equivalent animated placeholder).
- The skeleton is NOT a full-page blocking overlay or a modal.
- The chat input area remains visible (but disabled) during loading.
- The skeleton disappears and is replaced by plan cards (or an error) once the response arrives.

#### Scenario: skeleton replaces empty state during in-flight request

- GIVEN the app is in the empty state (no plan loaded)
- WHEN the doctor submits a message and the request is in-flight
- THEN the plan area renders one or more skeleton cards
- AND the top app bar remains visible
- AND the chat input is visible but disabled

#### Scenario: skeleton disappears after response arrives

- GIVEN the plan area is showing skeleton cards
- WHEN the fetch resolves with a 200 PlanResponseDto
- THEN the skeletons are removed from the DOM
- AND the move-operation cards are rendered in their place

---

### REQ-UI-09 — Error states with recovery guidance

Three named error conditions MUST produce distinct, actionable error messages.

| Error condition | HTTP status | `error` body field | Recovery message shown |
|---|---|---|---|
| `agenda_not_found` | 422 | `"agenda_not_found"` | Doctor is advised no agenda was found for today |
| `language_unavailable` | 503 | `"language_unavailable"` | Doctor is advised the language service is down |
| Network / unreachable | — (fetch throws) | none | Doctor is advised the scheduling service is unreachable |

Observable requirements:

- All error messages appear inline in the plan area (NOT a browser `alert()`).
- All error messages are dismissible OR the input can be resubmitted to retry.
- The input field is re-enabled after any error so the doctor can retry.
- Internal stack traces MUST NOT appear in the UI.
- HTTP status codes MUST NOT appear raw in the UI (e.g., do not render "Error: 422").

#### Scenario: 422 agenda_not_found shows human-readable message

- GIVEN `scheduling` returns HTTP 422 `{ "error": "agenda_not_found" }`
- WHEN the response is processed
- THEN the plan area shows an inline error message referencing "agenda"
- AND the message does NOT contain the literal string "422"
- AND the chat input is re-enabled so the doctor may retry

#### Scenario: 503 language_unavailable shows service-down message

- GIVEN `scheduling` returns HTTP 503 `{ "error": "language_unavailable" }`
- WHEN the response is processed
- THEN the plan area shows an inline message indicating the language service is unavailable
- AND the chat input is re-enabled

#### Scenario: network error shows reachability message

- GIVEN the fetch to `POST /messages` throws a TypeError (service unreachable)
- WHEN the error is caught
- THEN the plan area shows an inline message indicating the scheduling service cannot be reached
- AND the chat input is re-enabled

---

### REQ-UI-10 — Empty state

Before any message is submitted, the plan area MUST render a non-blank empty state.

Observable requirements:

- An illustrative icon (e.g., `Calendar` or `MessageSquare` from lucide-react) is shown.
- Short copy encourages the doctor to type their first instruction.
- The empty state uses muted/secondary colors — it does NOT resemble an error.

#### Scenario: initial page load shows the empty state

- GIVEN the app has just loaded (no fetch has been triggered)
- WHEN the doctor views the page
- THEN the plan area shows an icon and guiding copy
- AND no skeleton, no error message, and no plan cards are visible

---

### REQ-UI-11 — Accessibility

Observable requirements (each must be independently verifiable):

1. **Focus rings**: all interactive elements (input, button, toggle) show a visible
   focus ring on keyboard focus (minimum 3 px offset, `--ring #006CE4` in light mode).
2. **Color contrast**: all body text meets WCAG 2.1 AA (4.5:1 ratio against its background).
   Primary text (`#001A3D` on `#FFFFFF`) passes; dark-mode text (`#E8EEF6` on `#001A3D`) passes.
3. **Keyboard navigation**: Tab cycles through all interactive elements in DOM order;
   Enter submits the form; Escape on the input field does NOT clear the message.
4. **Reduced motion**: no CSS animation or transition runs when
   `@media (prefers-reduced-motion: reduce)` is active. Skeleton pulse animations and
   microinteractions are suppressed.
5. **ARIA labels**: the chat input field has an `aria-label` or associated `<label>`.
   The submit button has an accessible name. Conflict badges have `role="status"` or
   equivalent so screen readers announce them.
6. **Landmarks**: the top app bar is wrapped in `<header>` (or `role="banner"`);
   the main content area in `<main>`; the plan area has a descriptive `aria-label`.

#### Scenario: submit button is keyboard-reachable and activatable

- GIVEN the app is loaded
- WHEN the doctor presses Tab until the submit button is focused
- THEN the button shows a visible focus ring
- AND pressing Enter or Space triggers the same submit handler as a click

#### Scenario: conflict badge is announced to screen readers

- GIVEN a plan with one OVERFLOWS_CLOSING conflict is rendered
- WHEN a screen reader reads the conflict badge
- THEN the accessible text conveys the conflict reason
- AND the badge has a role or aria attribute that marks it as a status region

#### Scenario: skeleton pulse is suppressed under reduced motion

- GIVEN `@media (prefers-reduced-motion: reduce)` is active
- WHEN a fetch is in-flight and skeletons are rendered
- THEN the skeleton components show NO animation (no pulsing, no fade)

---

### REQ-UI-12 — Vitest + Testing Library test suite (standard mode)

The `apps/web` package MUST have Vitest + Testing Library + jsdom configured and
producing at least a green smoke pass.

Observable requirements:

- `pnpm -F web test` (or `pnpm -F web test run`) exits with code 0.
- At minimum one test per critical rendering path:
  - ChatInput: empty submission is blocked.
  - ProposedPlanView: move-operation card renders patientId, from/to times.
  - ProposedPlanView: conflict badge renders for OVERFLOWS_CLOSING.
  - ProposedPlanView: loading skeleton is shown during in-flight state.
  - ProposedPlanView: error message shown for `agenda_not_found`.

#### Scenario: test suite runs and passes in CI (no DB required)

- GIVEN the repo is checked out in a CI environment
- AND `VITE_SCHEDULING_URL` is not set (or set to a dummy)
- WHEN `pnpm -F web test run` is executed
- THEN the test process exits with code 0
- AND all test assertions pass without network calls

---

## Constraints (WHAT, not HOW)

| Constraint | Observable effect |
|---|---|
| BFF rule (ADR-0007) | The web app NEVER calls `language POST /interpret` directly; all requests go to `VITE_SCHEDULING_URL` |
| `status: 'proposed'` only | The web app renders proposed plans; no confirm/apply UI exists in this slice |
| No router or global store | Navigation state and plan result live in component-local state |
| No SSE consumption | The `EventSource` hook does NOT exist in this slice |
| Brand assets immutable | Logo PNGs are raster — never recolored or distorted; SVG migration is deferred |
| `VITE_SCHEDULING_URL` required | The env var MUST be documented in `apps/web/.env.example` |

---

## Acceptance checklist

- [ ] `tsc --noEmit` in `apps/web` passes with no `IntentResponse` references
- [ ] `pnpm -F web test run` exits 0
- [ ] Light mode: logo-horizontal visible; primary button is Clinical Blue `#006CE4`
- [ ] Dark mode: logo-dark visible; background shifts to Deep Navy `#001A3D`
- [ ] Submit with empty field: no fetch fired; button/input remains disabled or inert
- [ ] Submit "llego 40 minutos tarde": move card(s) render with patientId, from→to HH:MM
- [ ] Conflict card: OVERFLOWS_CLOSING badge visible and distinct
- [ ] Loading state: skeleton visible during in-flight; input disabled
- [ ] Error 422: human-readable message; "422" NOT raw-rendered; input re-enabled
- [ ] Error 503: human-readable message; input re-enabled
- [ ] Network error: human-readable message; input re-enabled
- [ ] All interactive elements show focus rings on keyboard focus
- [ ] Reduced-motion: no skeleton pulse animation
- [ ] Page `<title>` is "HealthSync" (or includes it)
- [ ] Favicon resolves to `icon.png`
