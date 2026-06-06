import { localTime, agenda, workingHours, appointment, timeSlot } from '../../../domain';
import type { Agenda } from '../../../domain';

/**
 * Prisma returns TIME(0) columns as Date objects anchored at 1970-01-01T00:00:00Z.
 * We MUST read UTC hours/minutes to avoid timezone traps on non-UTC hosts.
 */
export function toLocalTime(t: Date) {
  return localTime(t.getUTCHours(), t.getUTCMinutes());
}

type WorkingHoursRow = {
  id: string;
  doctorId: string;
  day: Date;
  openTime: Date;
  closeTime: Date;
};

type AppointmentRow = {
  id: string;
  doctorId: string;
  patientId: string;
  day: Date;
  startTime: Date;
  endTime: Date;
};

/**
 * Maps Prisma query results into a domain Agenda.
 * This is the ONLY file that imports both @prisma/client types and domain types.
 * Domain layer must never import @prisma/* (ADR-0002 hexagonal).
 */
export function toAgenda(whRow: WorkingHoursRow, apptRows: AppointmentRow[]): Agenda {
  const wh = workingHours(toLocalTime(whRow.openTime), toLocalTime(whRow.closeTime));

  const appointments = apptRows.map((row) =>
    appointment(
      row.id,
      row.patientId,
      timeSlot(toLocalTime(row.startTime), toLocalTime(row.endTime)),
    ),
  );

  return agenda(appointments, wh);
}
