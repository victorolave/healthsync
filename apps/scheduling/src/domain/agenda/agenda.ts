import type { Appointment } from './appointment';
import type { WorkingHours } from './working-hours';

export interface Agenda {
  readonly appointments: readonly Appointment[];
  readonly workingHours: WorkingHours;
}

export function agenda(appointments: Appointment[], workingHours: WorkingHours): Agenda {
  const sorted = [...appointments].sort((a, b) =>
    a.slot.start.compareTo(b.slot.start),
  );
  return Object.freeze({
    appointments: Object.freeze(sorted) as readonly Appointment[],
    workingHours,
  });
}
