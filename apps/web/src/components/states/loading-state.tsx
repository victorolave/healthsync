import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Three skeleton cards — shown while the scheduling service processes the request.
 * Uses shadcn Skeleton (not a blocking spinner) so the layout doesn't shift.
 */
export function LoadingState() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando plan">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
