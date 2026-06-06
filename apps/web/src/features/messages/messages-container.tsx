import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import type { AgendaDto, PlanResponseDto } from '@/lib/api/types'
import { confirmMessage, getAgenda, postMessage } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { ChatInput } from '@/components/chat-input'
import { ProposedPlanView } from '@/components/proposed-plan-view'
import { AgendaView, AgendaViewSkeleton } from '@/components/agenda-view'
import { EmptyState } from '@/components/states/empty-state'
import { LoadingState } from '@/components/states/loading-state'
import { ErrorState } from '@/components/states/error-state'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type PlanState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'result'; plan: PlanResponseDto }
  | { kind: 'applied' }
  | { kind: 'error'; message: string }

type AgendaState =
  | { kind: 'loading' }
  | { kind: 'ready'; agenda: AgendaDto }
  | { kind: 'error'; message: string }

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

/**
 * Single stateful container — owns fetch state and orchestrates the two-panel view.
 *
 * LEFT panel  → chat input + proposed plan/movements + approve button
 * RIGHT panel → current agenda (loaded on mount, updated on confirm)
 *
 * All child components are pure presentational.
 */
export function MessagesContainer() {
  const [input, setInput] = useState('')
  const [lastMessage, setLastMessage] = useState('')
  const [planState, setPlanState] = useState<PlanState>({ kind: 'empty' })
  const [agendaState, setAgendaState] = useState<AgendaState>({ kind: 'loading' })
  const [confirming, setConfirming] = useState(false)

  /* ---------------------------------------------------------------- */
  /* Load agenda on mount                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    void (async () => {
      const result = await getAgenda()
      if (result.ok) {
        setAgendaState({ kind: 'ready', agenda: result.data })
      } else {
        setAgendaState({ kind: 'error', message: result.error.message })
      }
    })()
  }, [])

  /* ---------------------------------------------------------------- */
  /* Submit message                                                     */
  /* ---------------------------------------------------------------- */

  const handleSubmit = async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    setPlanState({ kind: 'loading' })
    setLastMessage(trimmed)
    setInput('')

    const result = await postMessage(trimmed)

    if (result.ok) {
      setPlanState({ kind: 'result', plan: result.data })
    } else {
      setPlanState({ kind: 'error', message: result.error.message })
    }
  }

  /* ---------------------------------------------------------------- */
  /* Approve plan                                                       */
  /* ---------------------------------------------------------------- */

  const handleApprove = async () => {
    if (!lastMessage || confirming) return

    setConfirming(true)

    const result = await confirmMessage(lastMessage)

    if (result.ok) {
      // Update agenda with the freshly applied state
      setAgendaState({ kind: 'ready', agenda: result.data.agenda })
      setPlanState({ kind: 'applied' })
      toast.success('Cambios aplicados', {
        description: `${result.data.operations.length} movimiento${result.data.operations.length !== 1 ? 's' : ''} confirmado${result.data.operations.length !== 1 ? 's' : ''} en la agenda.`,
      })
    } else {
      toast.error('No se pudo aplicar', {
        description: result.error.message,
      })
    }

    setConfirming(false)
  }

  const handleRetry = () => {
    setPlanState({ kind: 'empty' })
  }

  const isSubmitting = planState.kind === 'loading'
  const hasPendingPlan =
    planState.kind === 'result' && planState.plan.operations.length > 0

  /* ---------------------------------------------------------------- */
  /* Render                                                             */
  /* ---------------------------------------------------------------- */

  return (
    /*
     * Two-panel grid:
     *   - Mobile: single column (stacked)
     *   - lg+: side-by-side, left panel slightly narrower (5/12) vs right (7/12)
     */
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
      <section
        className="lg:col-span-5 space-y-4"
        aria-label="Panel de mensajes y movimientos"
      >
        {/* Chat input — always visible */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={() => void handleSubmit()}
          loading={isSubmitting}
          disabled={confirming}
        />

        {/* Plan area */}
        {planState.kind === 'empty' && <EmptyState />}
        {planState.kind === 'loading' && <LoadingState />}
        {planState.kind === 'result' && (
          <>
            <ProposedPlanView plan={planState.plan} />

            {/* Approve button — only when there are operations to apply */}
            {hasPendingPlan && (
              <Button
                className="w-full"
                onClick={() => void handleApprove()}
                disabled={confirming}
                aria-label="Aprobar y aplicar los cambios propuestos a la agenda"
              >
                {confirming ? (
                  <>
                    <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                    Aplicando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
                    Aprobar cambios
                  </>
                )}
              </Button>
            )}
          </>
        )}
        {planState.kind === 'applied' && (
          <div
            role="status"
            className="flex flex-col items-center gap-3 py-8 text-center"
            aria-label="Cambios aplicados"
          >
            <div className="rounded-full bg-primary/10 p-3">
              <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Cambios aplicados correctamente
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              La agenda fue actualizada. Podés escribir un nuevo mensaje para
              proponer más cambios.
            </p>
          </div>
        )}
        {planState.kind === 'error' && (
          <ErrorState message={planState.message} onRetry={handleRetry} />
        )}
      </section>

      {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
      <section
        className="lg:col-span-7"
        aria-label="Panel de agenda"
      >
        {agendaState.kind === 'loading' && <AgendaViewSkeleton />}
        {agendaState.kind === 'ready' && <AgendaView agenda={agendaState.agenda} />}
        {agendaState.kind === 'error' && (
          <ErrorState
            message={agendaState.message}
            onRetry={() => {
              setAgendaState({ kind: 'loading' })
              void (async () => {
                const result = await getAgenda()
                if (result.ok) {
                  setAgendaState({ kind: 'ready', agenda: result.data })
                } else {
                  setAgendaState({ kind: 'error', message: result.error.message })
                }
              })()
            }}
          />
        )}
      </section>
    </div>
  )
}
