import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

/**
 * Inline error state — no raw status codes, Spanish copy only.
 * Re-enables the chat input so the user can try again.
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 py-10 text-center"
    >
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertCircle
          className="size-6 text-destructive"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm text-foreground max-w-xs">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}
