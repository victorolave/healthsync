import { MessageSquare } from 'lucide-react'

/**
 * Shown before the user submits their first message.
 * Provides a guiding prompt in Spanish.
 */
export function EmptyState() {
  return (
    <div
      className="flex flex-col items-center gap-4 py-16 text-center"
      aria-label="Estado inicial"
    >
      <div className="rounded-full bg-muted p-4">
        <MessageSquare className="size-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Contale qué pasó
        </p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Escribe un mensaje describiendo el cambio de agenda y el asistente
          reorganizará las citas automáticamente.
        </p>
      </div>
    </div>
  )
}
