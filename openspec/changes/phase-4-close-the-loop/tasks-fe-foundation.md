# Tasks — Phase 4 SLICE 1: FE-foundation (PR1)

**Change**: `phase-4-close-the-loop`  
**Slice**: `fe-foundation` (PR1 of 4, stacked to `main`)  
**Delivery**: Chained stacked-to-main PRs  
**Test mode**: Standard (Vitest + Testing Library + jsdom); runner: `cd apps/web && pnpm test`  
**Artifact store**: hybrid

---

## Overview

8 ordered work units, 3 requiring network access (npm install / shadcn CLI).  
Sequential dependencies: WU-01 → WU-02 → WU-03 (shadcn needs alias+CSS) → WU-04 → WU-05 → WU-06 → WU-07 → WU-08.  
No work units are safely parallelisable because each depends on the output of the prior (types before components; components before wiring; wiring before tests verify the full tree).

---

## Work Unit 01 — Tooling: deps + Vite alias + Vitest config

**Requires network**: YES (pnpm install)  
**Spec**: REQ-UI-12 (test runner), REQ-UI-03 (Tailwind v4 CSS-first)  
**Commit message**: `chore(web): add Tailwind v4, shadcn peer deps, Vitest + jsdom toolchain`

### Tasks

- [x] **T-01-A** `apps/web/package.json` — add production deps:
  ```
  class-variance-authority clsx tailwind-merge
  lucide-react
  @radix-ui/react-slot @radix-ui/react-separator
  @radix-ui/react-tooltip @radix-ui/react-scroll-area
  sonner
  ```
  Add dev deps:
  ```
  tailwindcss @tailwindcss/vite tw-animate-css
  vitest jsdom
  @testing-library/react @testing-library/user-event @testing-library/jest-dom
  @types/testing-library__jest-dom
  ```
  Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`

- [x] **T-01-B** `apps/web/vite.config.ts` — replace content:
  - Add `@tailwindcss/vite` plugin import + register it **before** `@vitejs/plugin-react`
  - Add `resolve.alias: { '@': path.resolve(__dirname, './src') }`
  - Keep `server.host: true, port: 5173`
  - Import `path` from `'node:path'`

- [x] **T-01-C** `apps/web/tsconfig.app.json` — add under `compilerOptions`:
  ```json
  "baseUrl": ".",
  "paths": { "@/*": ["./src/*"] }
  ```
  Add `"@types/node"` to `types` array (needed for `path.resolve` in vite.config.ts).

- [x] **T-01-D** `apps/web/vitest.config.ts` — create new file:
  ```ts
  import { defineConfig } from 'vitest/config'
  import react from '@vitejs/plugin-react'
  import path from 'node:path'

  export default defineConfig({
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
  })
  ```

- [x] **T-01-E** `apps/web/src/test/setup.ts` — create new file:
  ```ts
  import '@testing-library/jest-dom'
  ```

- [x] **T-01-F** Run `pnpm install` from the repo root (or `pnpm -F web install`) to lock new deps.

**Verification**: `pnpm -F web build` compiles; `pnpm -F web test run` (no tests yet → exits 0 with "no test files found" or equivalent).

---

## Work Unit 02 — Design tokens: index.css full replacement + delete App.css

**Requires network**: NO  
**Spec**: REQ-UI-03, REQ-UI-11 (focus rings, reduced motion)  
**Commit message**: `feat(web): replace purple theme with HealthSync brand tokens (Tailwind v4)`

### Tasks

- [x] **T-02-A** `apps/web/src/index.css` — REPLACE entire file with:
  1. Google Fonts `@import` for Figtree (500/600/700) + Inter (400/500) with `display=swap`
  2. `@import "tailwindcss";` (Tailwind v4 CSS-first)
  3. `@import "tw-animate-css";`
  4. `@theme inline { ... }` block — maps `--color-*` from CSS vars + sets `--radius-*`
  5. `:root` block — EXACT hexes:
     - `--background: #FFFFFF; --foreground: #001A3D`
     - `--card: #FFFFFF; --card-foreground: #001A3D`
     - `--primary: #006CE4; --primary-foreground: #FFFFFF`
     - `--secondary: #E6F8F4; --secondary-foreground: #00564B`
     - `--accent: #00C0A8; --accent-foreground: #FFFFFF`
     - `--muted: #EEF4FB; --muted-foreground: #5A6B82`
     - `--border: #E2E8F0; --input: #E2E8F0; --ring: #006CE4`
     - `--destructive: #DC2626; --success: #00A88A`
     - `--radius: 0.75rem`
     - `--font-sans: 'Inter', system-ui, sans-serif`
     - `--font-display: 'Figtree', system-ui, sans-serif`
  6. `.dark` block — dark palette:
     - `--background: #001A3D; --foreground: #E8EEF6`
     - `--card: #0A2447; --card-foreground: #E8EEF6`
     - `--primary: #2B86F0; --primary-foreground: #FFFFFF`
     - `--secondary: #0E2A4E; --secondary-foreground: #BFE9E0`
     - `--accent: #19D6BB; --accent-foreground: #001A3D`
     - `--muted: #0E2A4E; --muted-foreground: #9DB2CC`
     - `--border: #163358; --input: #163358; --ring: #2B86F0`
     - `--destructive: #F87171; --success: #19D6BB`
  7. `@layer base` — body uses `--font-sans`; `h1, h2, h3, nav` use `--font-display`; `.tabular-nums` sets `font-variant-numeric: tabular-nums`; `:focus-visible` ring 2px solid var(--ring) offset 2px; `@media (prefers-reduced-motion: reduce)` disables all transitions/animations.

- [x] **T-02-B** `apps/web/src/App.css` — DELETE file entirely. Remove `import './App.css'` from `App.tsx` (temporary — App.tsx is fully rewritten in WU-07).

- [x] **T-02-C** `apps/web/index.html` — update:
  - `<link rel="icon">` → `href="/brand/icon.png" type="image/png"`
  - `<title>` → `HealthSync`
  - `lang="es"` on `<html>` (medical product for Spanish-speaking doctors)

**Verification**: `pnpm -F web build` still compiles; browser dev-server shows deep navy / clinical blue palette, no purple.

---

## Work Unit 03 — shadcn/ui init + 9 primitives

**Requires network**: YES (npx shadcn@latest or manual Radix transcription)  
**Spec**: REQ-UI-03 (shadcn primitives), REQ-UI-08 (Skeleton), REQ-UI-06 (Badge)  
**Commit message**: `feat(web): add shadcn/ui primitives (button card input badge separator skeleton sonner tooltip scroll-area)`

### Tasks

- [x] **T-03-A** `apps/web/components.json` — create via `npx shadcn@latest init` or write manually:
  ```json
  {
    "$schema": "https://ui.shadcn.com/schema.json",
    "style": "default",
    "rsc": false,
    "tsx": true,
    "tailwind": { "config": "", "css": "src/index.css", "baseColor": "slate", "cssVariables": true },
    "aliases": { "components": "@/components", "utils": "@/lib/utils" }
  }
  ```
  Note: Tailwind v4 does not use a config file, so `tailwind.config` is empty string.

- [x] **T-03-B** `apps/web/src/lib/utils.ts` — create (shadcn's `cn` helper):
  ```ts
  import { clsx, type ClassValue } from 'clsx'
  import { twMerge } from 'tailwind-merge'

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
  }
  ```

- [x] **T-03-C** Install 9 shadcn primitives via CLI (run from `apps/web/`):
  ```
  npx shadcn@latest add button card input badge separator skeleton sonner tooltip scroll-area
  ```
  This writes to `src/components/ui/`. If CLI fails (offline/env), transcribe from shadcn source manually + verify Radix peer deps installed in T-01-A.
  
  Files created: `src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `badge.tsx`, `separator.tsx`, `skeleton.tsx`, `sonner.tsx`, `tooltip.tsx`, `scroll-area.tsx`.

**Note on line-count budget**: Generated `src/components/ui/*` files are EXCLUDED from the 400-line manual-authoring budget (they are vendor-generated). See Review Workload Forecast section below.

**Verification**: `pnpm -F web build` compiles cleanly; `src/components/ui/` contains the 9 files.

---

## Work Unit 04 — API layer: types + client

**Requires network**: NO  
**Spec**: REQ-UI-01 (PlanResponseDto mirror), REQ-UI-09 (error mapping)  
**Commit message**: `feat(web): add PlanResponseDto mirror types and typed API client`

### Tasks

- [x] **T-04-A** `apps/web/src/lib/api/types.ts` — hand-written DTO mirror:
  ```ts
  // Mirror of apps/scheduling/src/messages/dto/plan-response.dto.ts (Phase 2, frozen)
  // Drift risk: update both if scheduling contract changes; future: extract shared-types package.

  export interface TimeSlotDto {
    start: string   // 'HH:MM'
    end: string     // 'HH:MM'
  }

  export interface OperationDto {
    type: 'move'
    appointmentId: string
    patientId: string
    from: TimeSlotDto
    to: TimeSlotDto
  }

  export interface ConflictDto {
    appointmentId: string
    reason: 'OVERFLOWS_CLOSING'
    proposedSlot: TimeSlotDto
  }

  export interface PlanResponseDto {
    status: 'proposed'
    operations: OperationDto[]
    conflicts: ConflictDto[]
    confidence: number
  }

  export type ApiError =
    | { kind: 'agenda_not_found' }
    | { kind: 'language_unavailable' }
    | { kind: 'network' }
    | { kind: 'unknown'; message: string }

  export type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: ApiError }
  ```

- [x] **T-04-B** `apps/web/src/lib/api/client.ts` — typed fetch wrapper:
  - Read `VITE_SCHEDULING_URL` from `import.meta.env`; fallback `http://localhost:3000`
  - Export `postMessage(message: string): Promise<Result<PlanResponseDto>>`
  - Map 422 `{ error: 'agenda_not_found' }` → `{ ok: false, error: { kind: 'agenda_not_found' } }`
  - Map 503 `{ error: 'language_unavailable' }` → `{ ok: false, error: { kind: 'language_unavailable' } }`
  - Catch `TypeError` (network) → `{ ok: false, error: { kind: 'network' } }`
  - All other non-ok HTTP → `{ ok: false, error: { kind: 'unknown', message: ... } }`
  - On 200 → `{ ok: true, data: await response.json() as PlanResponseDto }`

**Verification**: `pnpm -F web build` compiles with no `IntentResponse` references; `tsc --noEmit` exits 0.

---

## Work Unit 05 — Hooks + atomic presentational components

**Requires network**: NO  
**Spec**: REQ-UI-02 (dark mode), REQ-UI-03 (fonts/tokens), REQ-UI-05 (operation card), REQ-UI-06 (conflict badge), REQ-UI-07 (confidence), REQ-UI-08 (skeleton), REQ-UI-09 (error), REQ-UI-10 (empty), REQ-UI-11 (accessibility)  
**Commit message**: `feat(web): add useDarkMode hook + all presentational leaf components`

### Tasks

- [x] **T-05-A** `apps/web/src/hooks/use-dark-mode.ts` — hook:
  - Reads `localStorage.getItem('theme')` on init; seeds from `prefers-color-scheme` if not set
  - Toggles `.dark` class on `document.documentElement`
  - Persists choice to `localStorage`
  - Returns `{ isDark: boolean, toggle: () => void }`

- [x] **T-05-B** `apps/web/src/components/plan-operation-card.tsx` — presentational:
  - Props: `{ op: OperationDto; hasConflict?: boolean }`
  - Renders: `patientId`, `from.start – from.end` → `ArrowLeftRight` icon → `to.start – to.end`
  - Times wrapped in `<span className="tabular-nums">`
  - `appointmentId` in muted style
  - If `hasConflict`: renders `<ConflictBadge>` inline (import from `./conflict-badge`)
  - Accessible: `<article aria-label={...}>`

- [x] **T-05-C** `apps/web/src/components/conflict-badge.tsx` — presentational:
  - Props: `{ conflict: ConflictDto }`
  - Renders: shadcn `<Badge>` with amber/warning variant styling (not pure `destructive` — use `className` override: `bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-300`)
  - Text: `"Se pasa del horario de cierre"` (Spanish, REQ-UI-06 resolution: flag-for-review, not hard-destructive)
  - Shows `proposedSlot.start – proposedSlot.end` in muted text below the badge
  - `role="status"` + `aria-label` for screen readers (REQ-UI-11)

- [x] **T-05-D** `apps/web/src/components/confidence-meter.tsx` — presentational:
  - Props: `{ confidence: number }`
  - Renders: `${Math.round(confidence * 100)}%` in muted color (`text-muted-foreground text-sm`)
  - Used only when `confidence` is a valid number (caller guards)

- [x] **T-05-E** `apps/web/src/components/states/empty-state.tsx` — presentational:
  - Renders: `<Calendar>` lucide icon + `"Contale al sistema qué pasó — reorganiza el resto"` copy
  - Muted colors; no error styling

- [x] **T-05-F** `apps/web/src/components/states/loading-state.tsx` — presentational:
  - Renders exactly **3** `<Skeleton>` cards (spec resolution: skeleton count = 3)
  - Each skeleton mimics the height of a PlanOperationCard
  - No spinner; no blocking overlay

- [x] **T-05-G** `apps/web/src/components/states/error-state.tsx` — presentational:
  - Props: `{ error: ApiError; onRetry: () => void }`
  - Maps `error.kind` to Spanish human-readable strings:
    - `agenda_not_found` → `"No se encontró la agenda para hoy. Verificá la fecha o contactá soporte."`
    - `language_unavailable` → `"El servicio de lenguaje no está disponible. Intentá de nuevo en unos minutos."`
    - `network` → `"No se puede comunicar con el servicio de turnos. Verificá tu conexión."`
    - `unknown` → `"Ocurrió un error inesperado. Intentá de nuevo."`
  - Renders inline (no modal/alert); shows `<Button onClick={onRetry}>Reintentar</Button>`
  - MUST NOT render raw HTTP status codes

- [x] **T-05-H** `apps/web/src/components/proposed-plan-view.tsx` — presentational:
  - Props: `{ plan: PlanResponseDto }`
  - If `plan.operations.length === 0` → renders `<EmptyState />`
  - Otherwise: maps `operations[]` → `<PlanOperationCard>` (passes `hasConflict` if `conflicts[]` contains matching `appointmentId`)
  - Renders `<ConfidenceMeter confidence={plan.confidence} />` when confidence is a valid number
  - `aria-label="Plan propuesto"` on wrapper `<section>`

- [x] **T-05-I** `apps/web/src/components/chat-input.tsx` — presentational:
  - Props: `{ value: string; onChange: (v: string) => void; onSubmit: () => void; loading: boolean }`
  - Renders: shadcn `<Card>` containing `<Input>` + `<Button>`
  - Placeholder: `"Contale qué pasó — reorganiza el resto"`
  - `aria-label="Instrucción de agenda"` on `<Input>`; accessible name on `<Button>`
  - Submit on Enter key (keydown handler) AND button click
  - Disabled when `loading` OR `value.trim() === ''`
  - After submit: field is NOT cleared (per REQ-UI-04 spec)

**Verification**: `pnpm -F web build` compiles; all component files exist in the right paths.

---

## Work Unit 06 — AppShell + Header

**Requires network**: NO  
**Spec**: REQ-UI-02 (brand shell + dark toggle), REQ-UI-11 (landmarks)  
**Commit message**: `feat(web): add AppShell with branded header and dark-mode toggle`

### Tasks

- [x] **T-06-A** `apps/web/public/brand/` — copy assets:
  - Copy `assets/icon.png` → `apps/web/public/brand/icon.png`
  - Copy `assets/logo-horizontal.png` → `apps/web/public/brand/logo-horizontal.png`
  - Copy `assets/logo-dark.png` → `apps/web/public/brand/logo-dark.png`
  - Copy `assets/logo.png` → `apps/web/public/brand/logo.png`
  - (4 files total; skip `blue-version.png` — not referenced)

- [x] **T-06-B** `apps/web/src/components/app-shell.tsx` — layout wrapper:
  - Props: `{ children: React.ReactNode }`
  - Structure:
    ```
    <div class="min-h-svh bg-background text-foreground">
      <header role="banner" class="sticky top-0 z-50 border-b bg-background/90 backdrop-blur">
        <!-- logo + "HealthSync" wordmark + dark toggle -->
      </header>
      <main class="mx-auto max-w-2xl px-4 py-8">
        {children}
      </main>
    </div>
    ```
  - Logo: `<img src="/brand/logo-horizontal.png">` in light, `<img src="/brand/logo-dark.png">` in dark (toggled by `isDark` from `useDarkMode`)
  - Dark toggle: `<Button variant="ghost" size="icon">` with `Sun` / `Moon` lucide icon; `aria-label="Cambiar tema"`
  - Top bar is sticky (`sticky top-0`)

**Verification**: `pnpm -F web dev` — app bar visible with logo and toggle; toggle switches logo image and background.

---

## Work Unit 07 — Rewire App.tsx + MessagesContainer

**Requires network**: NO  
**Spec**: REQ-UI-01 (remove IntentResponse), REQ-UI-04 (chat input wired to fetch), REQ-UI-08 (loading state), REQ-UI-09 (error states), REQ-UI-10 (empty state)  
**Commit message**: `feat(web): wire MessagesContainer + rewire App.tsx; remove IntentResponse`

### Tasks

- [x] **T-07-A** `apps/web/src/features/messages/messages-container.tsx` — SINGLE stateful container:
  - State: `message: string`, `loading: boolean`, `plan: PlanResponseDto | null`, `error: ApiError | null`, `lastMessage: string` (kept for PR4 Confirm wiring)
  - On submit: calls `postMessage(message)`, sets loading, handles `Result<PlanResponseDto>`
  - Renders:
    - `<ChatInput>` (always visible, disabled when loading)
    - Plan area:
      - `loading === true` → `<LoadingState />`
      - `error !== null` → `<ErrorState error={error} onRetry={handleRetry} />`
      - `plan !== null && !loading` → `<ProposedPlanView plan={plan} />`
      - else (initial) → `<EmptyState />`
  - `handleRetry` clears error and re-enables input (does NOT auto-re-submit)
  - Plan area wrapped in `<section aria-label="Plan propuesto" aria-live="polite">`

- [x] **T-07-B** `apps/web/src/App.tsx` — REPLACE entire file:
  - Remove ALL `IntentResponse`, `IntentParams`, `Intent` type definitions
  - Remove `App.css` import
  - Import `AppShell` + `MessagesContainer`
  - Returns: `<AppShell><MessagesContainer /></AppShell>`
  - No local state, no fetch logic in App.tsx

- [x] **T-07-C** `apps/web/.env.example` — create:
  ```
  # URL of the scheduling service (required)
  VITE_SCHEDULING_URL=http://localhost:3000
  ```

**Verification**: `pnpm -F web build` exits 0; `tsc --noEmit` exits 0; grep for `IntentResponse` in `src/` returns 0 matches.

---

## Work Unit 08 — Tests (Vitest + Testing Library)

**Requires network**: NO  
**Spec**: REQ-UI-12  
**Commit message**: `test(web): add Vitest tests for proposed-plan-view, chat-input, error-state`

### Tasks

- [x] **T-08-A** `apps/web/src/tests/proposed-plan-view.test.tsx`:

  **Fixture** (define at top of file):
  ```ts
  const twoOpOnConflict: PlanResponseDto = {
    status: 'proposed',
    operations: [
      { type: 'move', appointmentId: 'apt-1', patientId: 'garcia',
        from: { start: '09:00', end: '09:30' }, to: { start: '09:40', end: '10:10' } },
      { type: 'move', appointmentId: 'apt-2', patientId: 'lopez',
        from: { start: '16:30', end: '17:00' }, to: { start: '17:10', end: '17:40' } },
    ],
    conflicts: [{ appointmentId: 'apt-2', reason: 'OVERFLOWS_CLOSING',
      proposedSlot: { start: '17:10', end: '17:40' } }],
    confidence: 0.88,
  }
  const emptyPlan: PlanResponseDto = {
    status: 'proposed', operations: [], conflicts: [], confidence: 0.85,
  }
  ```

  **Test cases**:
  1. `renders operation cards for each entry` — render `<ProposedPlanView plan={twoOpOnConflict}>`, assert `garcia` and `lopez` visible, `09:00` and `09:40` visible
  2. `renders conflict badge only on conflicting card` — assert badge text "Se pasa del horario de cierre" present; assert `garcia` card has no badge
  3. `renders confidence meter` — assert `88%` visible
  4. `renders empty state when operations is empty` — render `<ProposedPlanView plan={emptyPlan}>`, assert empty-state copy visible; assert no operation cards

- [x] **T-08-B** `apps/web/src/tests/chat-input.test.tsx`:

  **Test cases**:
  1. `does not call onSubmit when value is empty` — render with `value=""`, click button, assert `onSubmit` not called
  2. `calls onSubmit on Enter key when value is non-empty` — render with `value="llego tarde"`, fire `keydown Enter`, assert `onSubmit` called once
  3. `disables input and button while loading` — render with `loading={true} value="llego tarde"`, assert input `disabled`, button `disabled`

- [x] **T-08-C** `apps/web/src/tests/error-state.test.tsx`:

  **Test cases**:
  1. `renders agenda_not_found message in Spanish` — render with `error={{ kind: 'agenda_not_found' }}`, assert text includes "agenda"; assert "422" NOT in document
  2. `renders language_unavailable message in Spanish` — render with `error={{ kind: 'language_unavailable' }}`, assert text includes "lenguaje" or "disponible"
  3. `renders network error message in Spanish` — render with `error={{ kind: 'network' }}`, assert text includes "conexión" or "comunicar"
  4. `Reintentar button calls onRetry` — render with any error, click `Reintentar`, assert `onRetry` called

- [x] **T-08-D** Run full suite: `cd apps/web && pnpm test` — all tests pass, exit 0.

**Verification**: `pnpm -F web test run` exits 0; at minimum 10 passing test cases.

---

## Dependency Order (sequential)

```
WU-01 (tooling: pnpm install) 
  → WU-02 (index.css tokens — CSS must exist for shadcn)
  → WU-03 (shadcn init + 9 primitives — needs alias + CSS in place)
  → WU-04 (API types + client — no UI deps)
  → WU-05 (presentational components — depends on types from WU-04)
  → WU-06 (AppShell + assets — depends on useDarkMode from WU-05)
  → WU-07 (App.tsx + MessagesContainer rewire — depends on all components)
  → WU-08 (tests — depends on the full component tree)
```

All work units are sequential. No safe parallelism exists in a single-developer context because:
- WU-03 (shadcn CLI) reads `src/index.css` and the `@` alias from `components.json`/vite config
- WU-05 imports from WU-04 (types)
- WU-07 imports from WU-05 and WU-06
- WU-08 renders components from WU-05–WU-07

---

## Open Spec Items — Resolutions

| Item | Resolution applied |
|------|--------------------|
| OVERFLOWS_CLOSING badge color | Amber/warning (`bg-amber-100 text-amber-800`), NOT pure `destructive` red. Rationale: flag-for-review, not a hard error. Screen-reader `role="status"` added. |
| Skeleton count | **3** skeleton cards during loading state. |
| `lang` attribute | `<html lang="es">` — product is for Spanish-speaking doctors. |
| `blue-version.png` | Not copied to `public/brand/` — not referenced anywhere in the design. |

---

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| Work units | 8 |
| Total tasks | 30 |
| Manually authored files | ~25 |
| Estimated changed lines (hand-written) | ~320–380 |
| Generated `src/components/ui/` files | ~9 files / ~600–800 lines |
| **Total lines including generated** | ~950–1180 |
| 400-line budget risk (hand-written only) | **Medium** (320–380 — within 400 but near the top) |
| 400-line budget risk (including generated) | **High** (well over 400 if reviewer counts ui/ vendor files) |
| Chained PRs recommended | **Already chained** — this IS PR1; generated ui/ files inflate count |
| Decision needed before apply | **Clarify with reviewer**: count generated `src/components/ui/` toward the 400-line limit? Recommendation: EXCLUDE them (they are vendor-generated, equivalent to committed node_modules). If included, split WU-01–03 (tooling) into a sub-slice. |
| Network-required tasks | WU-01 (pnpm install), WU-03 (shadcn CLI) |

**Recommendation**: Apply as-is. Treat `src/components/ui/` as vendored (excluded from diff budget). Hand-written changes (320–380 lines) fit within the 400-line PR1 budget. If the reviewer includes generated files, open a `size:exception` rather than splitting further — the 9 primitives are atomic and untestable in isolation.

---

## Files Created / Modified Summary

| Path | Action | WU |
|------|--------|----|
| `apps/web/package.json` | Modified (new deps + scripts) | 01 |
| `apps/web/vite.config.ts` | Replaced | 01 |
| `apps/web/tsconfig.app.json` | Modified (paths + baseUrl) | 01 |
| `apps/web/vitest.config.ts` | Created | 01 |
| `apps/web/src/test/setup.ts` | Created | 01 |
| `apps/web/src/index.css` | Replaced (full brand token rewrite) | 02 |
| `apps/web/src/App.css` | Deleted | 02 |
| `apps/web/index.html` | Modified (favicon, title, lang) | 02 |
| `apps/web/components.json` | Created | 03 |
| `apps/web/src/lib/utils.ts` | Created | 03 |
| `apps/web/src/components/ui/*.tsx` (×9) | Created (shadcn CLI) | 03 |
| `apps/web/src/lib/api/types.ts` | Created | 04 |
| `apps/web/src/lib/api/client.ts` | Created | 04 |
| `apps/web/src/hooks/use-dark-mode.ts` | Created | 05 |
| `apps/web/src/components/plan-operation-card.tsx` | Created | 05 |
| `apps/web/src/components/conflict-badge.tsx` | Created | 05 |
| `apps/web/src/components/confidence-meter.tsx` | Created | 05 |
| `apps/web/src/components/states/empty-state.tsx` | Created | 05 |
| `apps/web/src/components/states/loading-state.tsx` | Created | 05 |
| `apps/web/src/components/states/error-state.tsx` | Created | 05 |
| `apps/web/src/components/proposed-plan-view.tsx` | Created | 05 |
| `apps/web/src/components/chat-input.tsx` | Created | 05 |
| `apps/web/public/brand/` (×4 PNGs) | Copied from `assets/` | 06 |
| `apps/web/src/components/app-shell.tsx` | Created | 06 |
| `apps/web/src/features/messages/messages-container.tsx` | Created | 07 |
| `apps/web/src/App.tsx` | Replaced (remove IntentResponse) | 07 |
| `apps/web/.env.example` | Created | 07 |
| `apps/web/src/tests/proposed-plan-view.test.tsx` | Created | 08 |
| `apps/web/src/tests/chat-input.test.tsx` | Created | 08 |
| `apps/web/src/tests/error-state.test.tsx` | Created | 08 |
