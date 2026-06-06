# Design — Phase 4, SLICE 1: FE-foundation (web-ui)

Rebuild `apps/web` on the HealthSync design system: replace the broken plain-Vite+inline-styles app with a Tailwind v4 (CSS-first) + shadcn/ui foundation, brand-mapped tokens (light + dark), an atomic + container/presentational component tree, a typed API client against the existing `POST /messages` contract, and a Vitest test harness. Display-only: it renders a `PlanResponseDto` proposed plan. **The Confirm action, POST /messages/confirm, and SSE are explicitly DEFERRED to FE-loop (PR4).**

This is the HOW at architecture level. Tasks (the ordered WHAT-to-do steps) come next in `sdd-tasks`.

## Quick path (what apply will build)

1. Add deps + wire Tailwind v4 plugin and `@` path alias into Vite/TS.
2. Replace `index.css` entirely with the Tailwind v4 entry + brand token blocks (`:root` + `.dark`) + font imports.
3. `shadcn init` + add the 9 primitives into `src/components/ui/`.
4. Copy brand assets to `public/brand/`, wire favicon + app-bar logo (light/dark swap).
5. Build the typed API client + DTO mirror types in `src/lib/`.
6. Build presentational components + `MessagesContainer` (fetch/state owner) + `AppShell`.
7. Rewire `App.tsx` to `AppShell > MessagesContainer`.
8. Add Vitest config + setup + component tests.

---

## ADR-style decisions

### D1 — Tailwind v4 CSS-first (no `tailwind.config.js`), brand tokens as CSS variables
**Decision:** Use `@import "tailwindcss"` + `@theme inline` + `:root`/`.dark` variable blocks driven by `@tailwindcss/vite`. No JS config file.
**Rationale:** Matches the LOCKED engine in the tokens memory; Tailwind v4 makes the JS config optional and shadcn's cssVariables mode reads the CSS variables directly. One source of truth for tokens (the CSS), no duplication.
**Rejected:** Tailwind v3 + `tailwind.config.js` (legacy, extra config surface, contradicts the locked decision); CSS Modules / vanilla CSS (loses shadcn ecosystem + utility velocity).

### D2 — shadcn/ui with `cssVariables: true`, components vendored into `src/components/ui/`
**Decision:** Run `npx shadcn@latest init` then `add button card input badge separator skeleton sonner tooltip scroll-area`. Components live in `src/components/ui/` as owned source.
**Rationale:** shadcn is copy-in, not a dependency — full control, themeable via our CSS variables, no runtime lock-in. The 9 primitives are exactly those the tokens memory lists for FE-foundation (avatar/dialog/sheet are deferred to FE-loop).
**Rejected:** A component library as an npm dep (MUI/Chakra) — fights the brand tokens, heavier, less control. Hand-rolling primitives — reinvents accessible Radix behaviors (focus, tooltip, scroll-area).
**Fallback if CLI is impractical in apply:** add each primitive manually by transcribing the current shadcn source for that component into `src/components/ui/<name>.tsx` and installing its Radix peer dep. The CLI is STRONGLY recommended because it also writes `components.json`, the `cn` util, and keeps Radix peer deps correct.

### D3 — Container/presentational split (project convention)
**Decision:** Exactly ONE stateful container, `MessagesContainer`, owns fetch + loading/error/data state. Every plan-rendering component is a PURE presentational function that receives props only. shadcn primitives are the atoms.
**Rationale:** Aligns with the repo's hexagonal/atomic-design discipline. Presentational components are trivially unit-testable from fixtures (no network), which is the whole point of the Vitest layer. Keeps the SSE/confirm logic (PR4) isolated to the container later — presentational components won't change.
**Rejected:** Putting fetch in `App.tsx` (mixes shell + data concerns, untestable); a global store/router (the proposal explicitly scopes those OUT — single view, single fetch).

### D4 — DTO mirror types hand-written in `src/lib/api/types.ts`, mirroring the backend exactly
**Decision:** Re-declare `PlanResponseDto`, `OperationDto`, `ConflictDto`, `TimeSlotDto` in the web package, byte-for-byte matching `apps/scheduling/.../plan-response.dto.ts`. Times stay as `'HH:MM'` strings.
**Rationale:** No shared package exists between web and scheduling, and introducing a shared workspace type package is out of scope for a ~200-line foundation slice. The contract is small, stable (Phase 2 frozen), and documented here.
**Rejected:** Importing across app boundaries (no path/tsconfig project ref set up, leaks NestJS build into web); generating from OpenAPI (no spec emitted yet — future improvement). **Risk noted:** drift between the two declarations is possible; mitigated by a contract comment pointing at the source file and a future shared-types package.

### D5 — Error mapping lives in the API client, returns a discriminated result
**Decision:** The client maps HTTP status + error body to a small `ApiError` union BEFORE the container sees it. `422 agenda_not_found`, `503 language_unavailable`, and network failures become distinct user-facing messages. The container renders a message, never a raw status.
**Rationale:** Keeps presentational error state dumb (just a string + retry). Centralizes the contract knowledge from the backend controller (which throws `{error:'agenda_not_found'}` / `{error:'language_unavailable'}`).
**Rejected:** Leaking `response.status` into the UI (the current broken App.tsx does this — fragile, not user-facing).

### D6 — Dark mode via a `useDarkMode` hook toggling `.dark` on `<html>`, persisted
**Decision:** A `useDarkMode` hook reads `prefers-color-scheme` as the initial value, persists the user's explicit choice in `localStorage`, and toggles the `.dark` class on `documentElement`. The app-bar logo swaps `logo-horizontal.png` ↔ `logo-dark.png` off that state.
**Rationale:** shadcn dark mode is class-based; this is the canonical pattern. Honors system preference but lets the doctor override. No theme provider library needed for a single toggle.
**Rejected:** `next-themes` (Next-specific, overkill for one Vite toggle); media-query-only (can't be toggled by the user).

---

## File tree (target)

```
apps/web/
├── components.json                      # shadcn config (cssVariables: true, alias @)
├── vite.config.ts                       # + @tailwindcss/vite, + alias @ → ./src
├── vitest.config.ts                     # NEW: jsdom env, setupFiles, alias @
├── index.html                           # favicon → /brand/icon.png, <title>HealthSync</title>
├── public/
│   └── brand/                           # NEW: copied from repo-root assets/
│       ├── icon.png  logo-horizontal.png  logo-dark.png  logo.png
├── src/
│   ├── main.tsx                         # unchanged (imports ./index.css + App)
│   ├── index.css                        # REPLACED: tailwindcss import + @theme + :root/.dark tokens + fonts
│   ├── App.tsx                          # REWIRED: <AppShell><MessagesContainer/></AppShell>
│   ├── App.css                          # DELETED (inline-style leftover)
│   ├── test/
│   │   └── setup.ts                     # NEW: import '@testing-library/jest-dom'
│   ├── lib/
│   │   ├── utils.ts                     # cn() (shadcn) — clsx + tailwind-merge
│   │   └── api/
│   │       ├── types.ts                 # PlanResponseDto/OperationDto/ConflictDto/TimeSlotDto mirror
│   │       └── client.ts                # postMessage(message) → Result<PlanResponseDto, ApiError>
│   ├── hooks/
│   │   └── use-dark-mode.ts             # useDarkMode(): { isDark, toggle }
│   ├── components/
│   │   ├── ui/                          # shadcn primitives (vendored)
│   │   │   ├── button.tsx  card.tsx  input.tsx  badge.tsx  separator.tsx
│   │   │   ├── skeleton.tsx  sonner.tsx  tooltip.tsx  scroll-area.tsx
│   │   ├── app-shell.tsx                # presentational: top app bar (logo + name + dark toggle) + centered column
│   │   ├── chat-input.tsx               # presentational: prompt card, value/onChange/onSubmit/loading props
│   │   ├── proposed-plan-view.tsx       # presentational: renders operations[] + conflicts[] + confidence
│   │   ├── plan-operation-card.tsx      # presentational: one move op (patient, from→to, ArrowLeftRight)
│   │   ├── conflict-badge.tsx           # presentational: OVERFLOWS_CLOSING → amber/destructive Badge
│   │   ├── confidence-meter.tsx         # presentational: subtle confidence indicator
│   │   └── states/
│   │       ├── empty-state.tsx          # presentational: idle "type something" hint
│   │       ├── loading-state.tsx        # presentational: skeleton cards (not a blocking spinner)
│   │       └── error-state.tsx          # presentational: message + retry button
│   └── features/
│       └── messages/
│           └── messages-container.tsx   # CONTAINER: owns message/loading/error/plan state; calls client; composes the above
└── src/components/__tests__/            # NEW (or co-located *.test.tsx)
    ├── proposed-plan-view.test.tsx
    ├── chat-input.test.tsx
    └── error-state.test.tsx
```

---

## Setup steps (exact)

### package.json deltas

Runtime `dependencies` to add:
```
class-variance-authority   clsx   tailwind-merge   lucide-react   @radix-ui/react-slot
@radix-ui/react-separator  @radix-ui/react-tooltip  @radix-ui/react-scroll-area   sonner
```
(`@radix-ui/*` are pulled automatically by the shadcn CLI per component; listed for the manual fallback. `button`/`card`/`input`/`badge`/`skeleton` need no Radix dep beyond `react-slot`.)

`devDependencies` to add:
```
tailwindcss   @tailwindcss/vite   tw-animate-css
vitest   @vitejs/plugin-react (already present)   jsdom
@testing-library/react   @testing-library/user-event   @testing-library/jest-dom
```
> Use `tw-animate-css` (the Tailwind v4 successor to `tailwindcss-animate`); the old plugin assumes a JS config. shadcn v4 templates already reference it.

`scripts` to add:
```jsonc
"test": "vitest run",
"test:watch": "vitest"
```

### vite.config.ts (target)
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: true, port: 5173 },
});
```

### tsconfig.app.json delta (path alias)
```jsonc
"compilerOptions": {
  // ...existing...
  "baseUrl": ".",
  "paths": { "@/*": ["./src/*"] }
}
```

### components.json (shadcn)
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### CLI flow (recommended)
```bash
cd apps/web
pnpm add class-variance-authority clsx tailwind-merge lucide-react sonner
pnpm add -D tailwindcss @tailwindcss/vite tw-animate-css \
  vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
# wire vite.config.ts + tsconfig alias + create src/index.css (token block below) FIRST
npx shadcn@latest init            # detects Vite + the alias, writes components.json + lib/utils
npx shadcn@latest add button card input badge separator skeleton sonner tooltip scroll-area
```
> Order matters: `index.css` (with the Tailwind import) and the path alias must exist before `shadcn init`, or the CLI cannot locate the CSS / resolve `@`.

---

## index.css — full Tailwind v4 entry + brand tokens

Replace the ENTIRE current purple file with this. Hex values transcribed verbatim from the finalized-tokens memory.

```css
@import "tailwindcss";
@import "tw-animate-css";

/* Fonts: Figtree (display/nav 500/600/700) + Inter (body 400/500), swap. */
@import url("https://fonts.googleapis.com/css2?family=Figtree:wght@500;600;700&family=Inter:wght@400;500&display=swap");

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.75rem;

  --background: #FFFFFF;
  --foreground: #001A3D;            /* deep navy text */
  --card: #FFFFFF;
  --card-foreground: #001A3D;
  --popover: #FFFFFF;
  --popover-foreground: #001A3D;

  --primary: #006CE4;               /* clinical blue */
  --primary-foreground: #FFFFFF;
  --secondary: #E6F8F4;             /* light teal surface */
  --secondary-foreground: #00564B;
  --accent: #00C0A8;                /* tech teal */
  --accent-foreground: #FFFFFF;

  --muted: #EEF4FB;
  --muted-foreground: #5A6B82;
  --border: #E2E8F0;
  --input: #E2E8F0;
  --ring: #006CE4;

  --destructive: #DC2626;           /* conflicts / OVERFLOWS_CLOSING */
  --destructive-foreground: #FFFFFF;
  --success: #00A88A;               /* teal-green */

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Figtree", ui-sans-serif, system-ui, sans-serif;
}

.dark {
  --background: #001A3D;            /* navy (logo-dark bg) */
  --foreground: #E8EEF6;
  --card: #0A2447;
  --card-foreground: #E8EEF6;
  --popover: #0A2447;
  --popover-foreground: #E8EEF6;

  --primary: #2B86F0;
  --primary-foreground: #00122B;
  --secondary: #0E2A4E;
  --secondary-foreground: #BFE9E0;
  --accent: #19D6BB;
  --accent-foreground: #00122B;

  --muted: #0E2A4E;
  --muted-foreground: #9DB2CC;
  --border: #163358;
  --input: #163358;
  --ring: #2B86F0;

  --destructive: #F87171;
  --destructive-foreground: #00122B;
  --success: #19D6BB;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-success: var(--success);

  --font-sans: var(--font-sans);
  --font-display: var(--font-display);

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}

@layer base {
  * { border-color: var(--color-border); }
  body {
    margin: 0;
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  h1, h2, h3, nav { font-family: var(--font-display); font-weight: 600; }
  /* Tabular figures for appointment times. */
  .tabular-nums { font-variant-numeric: tabular-nums; }
  /* Accessibility: focus rings + reduced motion. */
  :focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
}
```
> Note: the finalized-tokens memory gives hex; if `shadcn init` rewrites these as OKLCH that is acceptable as long as the rendered color matches. Keep the brand hex as the source of truth.

---

## API client + types

### `src/lib/api/types.ts` (mirror of `apps/scheduling/.../plan-response.dto.ts`)
```ts
// CONTRACT MIRROR — keep in sync with
// apps/scheduling/src/messages/dto/plan-response.dto.ts (Phase 2, frozen).
export interface TimeSlotDto { start: string; end: string; }      // 'HH:MM'
export interface OperationDto {
  type: 'move';
  appointmentId: string;
  patientId: string;
  from: TimeSlotDto;
  to: TimeSlotDto;
}
export interface ConflictDto {
  appointmentId: string;
  reason: string;            // currently only 'OVERFLOWS_CLOSING'
  proposedSlot: TimeSlotDto;
}
export interface PlanResponseDto {
  status: 'proposed';
  operations: OperationDto[];
  conflicts: ConflictDto[];
  confidence: number;
}
```

### `src/lib/api/client.ts`
```ts
import type { PlanResponseDto } from './types';

const SCHEDULING_URL =
  import.meta.env.VITE_SCHEDULING_URL ?? 'http://localhost:3000';

export type ApiErrorKind =
  | 'agenda_not_found'      // 422
  | 'language_unavailable'  // 503
  | 'network'              // fetch threw
  | 'unknown';             // any other non-2xx

export interface ApiError { kind: ApiErrorKind; message: string; }

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

const MESSAGES: Record<ApiErrorKind, string> = {
  agenda_not_found:
    'No encontramos la agenda para ese día. Verificá la fecha e intentá de nuevo.',
  language_unavailable:
    'El servicio de interpretación no está disponible en este momento. Probá de nuevo en unos segundos.',
  network:
    'No pudimos conectarnos con el servicio de agenda. Revisá tu conexión.',
  unknown: 'Algo salió mal al procesar tu mensaje. Intentá de nuevo.',
};

export async function postMessage(message: string): Promise<Result<PlanResponseDto>> {
  let res: Response;
  try {
    res = await fetch(`${SCHEDULING_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  } catch {
    return { ok: false, error: { kind: 'network', message: MESSAGES.network } };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const kind: ApiErrorKind =
      body.error === 'agenda_not_found' ? 'agenda_not_found'
      : body.error === 'language_unavailable' ? 'language_unavailable'
      : 'unknown';
    return { ok: false, error: { kind, message: MESSAGES[kind] } };
  }

  return { ok: true, data: (await res.json()) as PlanResponseDto };
}
```
> The Result/discriminated-union return keeps the container's branching exhaustive and the presentational `ErrorState` dumb (just renders `error.message`).

---

## App.tsx rewire (composition)

```tsx
import { AppShell } from '@/components/app-shell';
import { MessagesContainer } from '@/features/messages/messages-container';

export default function App() {
  return (
    <AppShell>
      <MessagesContainer />
    </AppShell>
  );
}
```

`MessagesContainer` (the ONLY stateful piece):
- state: `message: string`, `status: 'idle' | 'loading' | 'error' | 'ready'`, `plan: PlanResponseDto | null`, `error: ApiError | null`, plus `lastMessage` (kept so PR4's Confirm can re-send the original raw message per LD1).
- `onSubmit` → `postMessage(message)` → branch on `Result` → set `plan` or `error`.
- renders: `<ChatInput .../>` then one of `<EmptyState/>` (idle) · `<LoadingState/>` (loading) · `<ErrorState onRetry/>` (error) · `<ProposedPlanView plan/>` (ready).

`AppShell` (presentational): top app bar with the logo (`logo-horizontal.png` light / `logo-dark.png` dark), product name, and the dark-mode toggle (drives `useDarkMode`); a centered `max-w-2xl` content column with generous padding.

---

## Component specs

| Component | Props | Behavior / brand notes |
|-----------|-------|------------------------|
| `AppShell` | `children` | App bar (logo + "HealthSync" + dark toggle via `useDarkMode`), centered `max-w-2xl` column, generous whitespace. Logo swaps on dark. |
| `ChatInput` | `value, onChange, onSubmit, loading` | Prominent `Card` with `Input` + primary `Button` (`Plus`/send icon). Placeholder: "Contale qué pasó — reorganiza el resto." Disabled while `loading`. Submit on Enter. |
| `ProposedPlanView` | `plan: PlanResponseDto` | Header "Plan propuesto". Maps `operations[]` → `PlanOperationCard`. If `conflicts.length` → a conflicts section of `ConflictBadge`. `ConfidenceMeter` at the bottom. Empty operations + no conflicts → subtle "sin cambios" note. |
| `PlanOperationCard` | `op: OperationDto` | `Card` showing patient (`patientId`), and `from.start–from.end` → `to.start–to.end` with an `ArrowLeftRight` (lucide) between them. Times use `.tabular-nums`. `MessageSquare`/`Clock` accent icon. |
| `ConflictBadge` | `conflict: ConflictDto` | `Badge` variant destructive/amber for `OVERFLOWS_CLOSING`; label "Se pasa del horario de cierre". Shows `proposedSlot`. Uses `--destructive`. |
| `ConfidenceMeter` | `confidence: number` | Subtle inline meter (thin bar or `value%` muted text). NOT loud. `tabular-nums` for the percent. |
| `EmptyState` | — | Idle hint with a `MessageSquare`/`Calendar` icon: "Escribí un cambio y te propongo cómo reordenar el día." |
| `LoadingState` | — | 2–3 `Skeleton` cards (NOT a blocking spinner — proposal/tokens require skeletons). |
| `ErrorState` | `message, onRetry` | `Card` with a `Bell`/alert icon, `error.message`, and a `Button` "Reintentar". |

**Microinteractions:** 150–300ms transitions on card mount / hover (via `tw-animate-css` utilities, e.g. `animate-in fade-in`); all wrapped by the global `prefers-reduced-motion` guard in `index.css`. No neon, no heavy motion.

**Icons (lucide-react):** `Calendar`, `MessageSquare`, `ArrowLeftRight`, `Bell`, `Clock`, `Plus` — stroke 2px.

---

## Test strategy (Standard Mode — Vitest)

> The web package is Standard Mode (test-after acceptable); strict TDD applies only to `apps/scheduling`. Tests here LOCK the presentational contract from fixtures.

### `vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
```

### `src/test/setup.ts`
```ts
import '@testing-library/jest-dom';
```

### Component tests (from fixtures, no network)
- **`proposed-plan-view.test.tsx`** — given a `PlanResponseDto` fixture with 2 operations + 1 `OVERFLOWS_CLOSING` conflict: asserts both operation cards render (patient + from→to times present), the conflict badge renders with the destructive treatment, and confidence is shown. A second fixture with empty operations + no conflicts asserts the "sin cambios" note.
- **`chat-input.test.tsx`** — typing then submitting (Enter and button) calls `onSubmit` with the value via `@testing-library/user-event`; input is disabled while `loading`.
- **`error-state.test.tsx`** — renders the mapped message; clicking "Reintentar" calls `onRetry`.

> Container/network are NOT unit-tested here (the proposal's web test scope is presentational rendering + input). The API client's error mapping is exercised indirectly through `ErrorState` rendering the mapped strings.

### Command
```bash
cd apps/web && pnpm test        # → vitest run
```

---

## Assets

1. Copy step (apply): `cp <repo-root>/assets/icon.png <repo-root>/assets/logo-horizontal.png <repo-root>/assets/logo-dark.png <repo-root>/assets/logo.png apps/web/public/brand/` (ignore `.DS_Store`). Do NOT recolor/distort — raster PNGs, keep proportions.
2. Favicon — `index.html`: replace `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` with `<link rel="icon" type="image/png" href="/brand/icon.png" />`; set `<title>HealthSync</title>`.
3. Dark-mode logo swap — `AppShell` renders `logo-horizontal.png` when `!isDark`, `logo-dark.png` when `isDark` (from `useDarkMode`).

---

## Deferred to FE-loop (PR4) — explicitly OUT of this slice

- The **Confirm** button and `POST /messages/confirm` call (re-derive flow, LD1).
- **SSE** consumption (`useEventSource`, `plan-ready` / `notification-created`).
- `NotificationsView` and the notifications UI.
- shadcn `avatar`, `dialog`, `sheet` primitives.
- Any 409 `agenda_conflict` mapping (only relevant to confirm — added in PR4).

`MessagesContainer` keeps `lastMessage` in state NOW so PR4 can wire Confirm without restructuring the container.

---

## Checklist (apply can verify)

- [ ] Tailwind v4 plugin + `@` alias wired in vite + tsconfig; `pnpm dev` boots.
- [ ] `index.css` purple theme fully replaced by the brand token block (light + dark).
- [ ] 9 shadcn primitives present in `src/components/ui/`.
- [ ] Brand assets in `public/brand/`; favicon + app-bar logo (light/dark) wired.
- [ ] `postMessage` returns the discriminated `Result`; 422/503/network mapped.
- [ ] `App.tsx` renders `AppShell > MessagesContainer` (no inline styles, no `IntentResponse`).
- [ ] `ProposedPlanView` renders operations + conflicts + confidence from a fixture.
- [ ] `cd apps/web && pnpm test` is green (3 component test files).
- [ ] No Confirm/SSE code present (deferred to PR4).

## Next step

`sdd-tasks` (once the FE-foundation spec is also ready) — break this design into ordered, dependency-aware tasks within the ~200–280 line PR1 budget.
