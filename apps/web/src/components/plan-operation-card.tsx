import { ArrowLeftRight } from 'lucide-react'
import type { OperationDto } from '@/lib/api/types'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface PlanOperationCardProps {
  operation: OperationDto
  conflict?: boolean
  className?: string
}

/**
 * Presentational card for a single 'move' operation.
 * Shows patient ID and the from→to time slot with tabular figures.
 */
export function PlanOperationCard({
  operation,
  conflict = false,
  className,
}: PlanOperationCardProps) {
  return (
    <Card
      className={cn(
        'transition-colors duration-150',
        conflict && 'border-warning',
        className,
      )}
    >
      <CardContent className="flex items-center gap-3 py-3 px-4">
        {/* Patient info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Paciente
          </p>
          <p className="text-sm font-semibold truncate" title={operation.patientId}>
            {operation.patientId}
          </p>
        </div>

        {/* Time: from → to */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="tabular-nums text-sm font-medium text-muted-foreground">
            {operation.from.start}
          </span>
          <ArrowLeftRight
            className="size-4 text-primary"
            aria-hidden="true"
          />
          <span className="tabular-nums text-sm font-semibold text-foreground">
            {operation.to.start}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
