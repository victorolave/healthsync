import { Calendar } from 'lucide-react'
import type { AgendaDto } from '@/lib/api/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                     */
/* ------------------------------------------------------------------ */

export function AgendaViewSkeleton() {
  return (
    <Card className="shadow-sm" aria-busy="true" aria-label="Cargando agenda">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-24 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="space-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Empty state                                                          */
/* ------------------------------------------------------------------ */

function AgendaEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="rounded-full bg-muted p-3">
        <Calendar className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">
        No hay citas programadas para hoy.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main AgendaView                                                      */
/* ------------------------------------------------------------------ */

interface AgendaViewProps {
  agenda: AgendaDto
}

/**
 * Presentational component — renders today's agenda from AgendaDto.
 * Shows date, working hours, and a list of appointments (patient + slot).
 * Pure — no fetching, no state.
 */
export function AgendaView({ agenda }: AgendaViewProps) {
  const { date, workingHours, appointments } = agenda

  // Format date string (e.g. "2026-06-06") → locale-friendly
  const formattedDate = (() => {
    try {
      return new Date(date + 'T00:00:00').toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    } catch {
      return date
    }
  })()

  return (
    <Card className="shadow-sm h-full" aria-label="Agenda de hoy">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-primary shrink-0" aria-hidden="true" />
          <CardTitle className="text-base font-semibold">Agenda de hoy</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground capitalize">{formattedDate}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          Horario:{' '}
          <span className="font-medium text-foreground">
            {workingHours.open}–{workingHours.close}
          </span>
        </p>
      </CardHeader>

      <Separator />

      <CardContent className="pt-3 pb-4">
        {appointments.length === 0 ? (
          <AgendaEmpty />
        ) : (
          <ul className="space-y-1" aria-label="Lista de citas">
            {appointments.map((appt) => (
              <li
                key={appt.id}
                className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50 transition-colors"
              >
                {/* Patient */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Paciente
                  </p>
                  <p
                    className="text-sm font-semibold truncate"
                    title={appt.patientId}
                  >
                    {appt.patientId}
                  </p>
                </div>

                {/* Slot */}
                <div
                  className="shrink-0 text-right"
                  aria-label={`Horario: ${appt.slot.start} a ${appt.slot.end}`}
                >
                  <p className="tabular-nums text-sm font-medium text-foreground">
                    {appt.slot.start}
                  </p>
                  <p className="tabular-nums text-xs text-muted-foreground">
                    hasta {appt.slot.end}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
