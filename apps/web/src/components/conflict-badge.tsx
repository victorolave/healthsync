import type { ConflictDto } from '@/lib/api/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ConflictBadgeProps {
  conflict: ConflictDto
  className?: string
}

const REASON_LABELS: Record<string, string> = {
  OVERFLOWS_CLOSING: 'Se pasa del horario de cierre',
}

/**
 * Amber badge flagging an OVERFLOWS_CLOSING conflict.
 * NOT destructive — it is a flag-for-review, not a hard blocker.
 * Includes proposed slot times and ARIA role for screen readers.
 */
export function ConflictBadge({ conflict, className }: ConflictBadgeProps) {
  const label = REASON_LABELS[conflict.reason] ?? conflict.reason

  return (
    <Badge
      role="status"
      aria-label={`Conflicto: ${label} — ${conflict.proposedSlot.start} a ${conflict.proposedSlot.end}`}
      className={cn(
        'bg-warning/15 text-warning border-warning/40 hover:bg-warning/25',
        className,
      )}
    >
      ⚠ {label} · {conflict.proposedSlot.start}–{conflict.proposedSlot.end}
    </Badge>
  )
}
