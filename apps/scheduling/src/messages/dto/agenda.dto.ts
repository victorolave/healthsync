/** Serialized working hours: HH:MM strings. */
export interface WorkingHoursDto {
  open: string;
  close: string;
}

/** Serialized appointment inside an AgendaDto. */
export interface AgendaAppointmentDto {
  id: string;
  patientId: string;
  slot: {
    start: string;
    end: string;
  };
}

/**
 * Response shape for GET /agenda.
 * All times are HH:MM strings produced via LocalTime.toString().
 */
export interface AgendaDto {
  date: string;
  workingHours: WorkingHoursDto;
  appointments: AgendaAppointmentDto[];
}
