import type { PlanResponseDto } from '@/lib/api/types'
import { PlanOperationCard } from './plan-operation-card'
import { ConflictBadge } from './conflict-badge'
import { ConfidenceMeter } from './confidence-meter'

interface ProposedPlanViewProps {
  plan: PlanResponseDto
}

/**
 * Pure presentational component — renders a PlanResponseDto.
 * Maps operations → PlanOperationCard; conflicts → ConflictBadge; shows confidence.
 * Empty plan (0 operations, 0 conflicts) → "sin cambios" copy.
 */
export function ProposedPlanView({ plan }: ProposedPlanViewProps) {
  const isEmpty = plan.operations.length === 0 && plan.conflicts.length === 0

  if (isEmpty) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">
          Sin cambios — la agenda ya está optimizada.
        </p>
      </div>
    )
  }

  return (
    <section aria-label="Plan propuesto" className="space-y-4">
      {/* Operation cards */}
      {plan.operations.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Movimientos propuestos
          </h2>
          {plan.operations.map((op) => {
            const conflict = plan.conflicts.find(
              (c) => c.appointmentId === op.appointmentId,
            )
            return (
              <div key={op.appointmentId} className="space-y-1">
                <PlanOperationCard
                  operation={op}
                  conflict={conflict !== undefined}
                />
                {conflict && <ConflictBadge conflict={conflict} />}
              </div>
            )
          })}
        </div>
      )}

      {/* Orphan conflicts (no corresponding operation) */}
      {plan.conflicts
        .filter(
          (c) =>
            !plan.operations.some((op) => op.appointmentId === c.appointmentId),
        )
        .map((conflict) => (
          <ConflictBadge key={conflict.appointmentId} conflict={conflict} />
        ))}

      {/* Confidence */}
      <ConfidenceMeter confidence={plan.confidence} />
    </section>
  )
}
