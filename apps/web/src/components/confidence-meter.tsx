import { cn } from '@/lib/utils'

interface ConfidenceMeterProps {
  confidence: number
  className?: string
}

/**
 * Subtle confidence display — shows as a percentage (e.g. "Confianza: 87%").
 * Muted styling to not distract from the plan content.
 */
export function ConfidenceMeter({ confidence, className }: ConfidenceMeterProps) {
  const pct = Math.round(confidence * 100)

  return (
    <p
      className={cn('text-xs text-muted-foreground tabular-nums', className)}
      aria-label={`Confianza del plan: ${pct}%`}
    >
      Confianza: {pct}%
    </p>
  )
}
