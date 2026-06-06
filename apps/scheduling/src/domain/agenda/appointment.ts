import type { TimeSlot } from './time-slot';

export interface Appointment {
  readonly id: string;
  readonly patientId: string;
  readonly slot: TimeSlot;
}

export function appointment(id: string, patientId: string, slot: TimeSlot): Appointment {
  return Object.freeze({ id, patientId, slot });
}

export function withSlot(appt: Appointment, slot: TimeSlot): Appointment {
  return Object.freeze({ id: appt.id, patientId: appt.patientId, slot });
}
