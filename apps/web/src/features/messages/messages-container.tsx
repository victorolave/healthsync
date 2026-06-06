import { useState } from 'react'
import type { PlanResponseDto } from '@/lib/api/types'
import { postMessage } from '@/lib/api/client'
import { ChatInput } from '@/components/chat-input'
import { ProposedPlanView } from '@/components/proposed-plan-view'
import { EmptyState } from '@/components/states/empty-state'
import { LoadingState } from '@/components/states/loading-state'
import { ErrorState } from '@/components/states/error-state'

type ViewState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'result'; plan: PlanResponseDto }
  | { kind: 'error'; message: string }

/**
 * Single stateful container — owns fetch state and orchestrates the view.
 * All child components are pure presentational.
 *
 * NOTE: lastMessage tracking is deferred to PR4 (Confirm flow). It will be
 * re-added when wiring POST /messages/confirm.
 */
export function MessagesContainer() {
  const [input, setInput] = useState('')
  const [view, setView] = useState<ViewState>({ kind: 'empty' })

  const handleSubmit = async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    setView({ kind: 'loading' })
    setInput('')

    const result = await postMessage(trimmed)

    if (result.ok) {
      setView({ kind: 'result', plan: result.data })
    } else {
      setView({ kind: 'error', message: result.error.message })
    }
  }

  const handleRetry = () => {
    setView({ kind: 'empty' })
  }

  const isLoading = view.kind === 'loading'

  return (
    <div className="space-y-6">
      {/* Chat input — always visible */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        loading={isLoading}
      />

      {/* Plan area */}
      {view.kind === 'empty' && <EmptyState />}
      {view.kind === 'loading' && <LoadingState />}
      {view.kind === 'result' && <ProposedPlanView plan={view.plan} />}
      {view.kind === 'error' && (
        <ErrorState message={view.message} onRetry={handleRetry} />
      )}
    </div>
  )
}
