import type { Agenda } from '../../domain';
import type { AgendaDto } from './agenda.dto';

/**
 * Maps a domain Agenda to an AgendaDto.
 *
 * SERIALIZATION GOTCHA: LocalTime instances must have .toString() called
 * explicitly — JSON.stringify does NOT call toString() on nested class instances
 * (same issue as plan.mapper.ts).
 *
 * @param ag   - The domain Agenda to map.
 * @param date - The calendar date the agenda belongs to (UTC midnight Date).
 */
export function agendaToDto(ag: Agenda, date: Date): AgendaDto {
  return {
    date: date.toISOString().slice(0, 10),
    workingHours: {
      open: ag.workingHours.open.toString(),
      close: ag.workingHours.close.toString(),
    },
    appointments: ag.appointments.map((appt) => ({
      id: appt.id,
      patientId: appt.patientId,
      slot: {
        start: appt.slot.start.toString(),
        end: appt.slot.end.toString(),
      },
    })),
  };
}
