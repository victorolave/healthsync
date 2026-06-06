/** Serialized time slot: HH:MM strings (LocalTime.toString() called explicitly). */
export interface TimeSlotDto {
  start: string;
  end: string;
}

export interface OperationDto {
  type: 'move';
  appointmentId: string;
  patientId: string;
  from: TimeSlotDto;
  to: TimeSlotDto;
}

export interface ConflictDto {
  appointmentId: string;
  reason: string;
  proposedSlot: TimeSlotDto;
}

/**
 * Response shape for POST /messages once the plan is calculated.
 * status is always 'proposed' in Phase 2 (apply/confirm deferred to Phase 4).
 */
export interface PlanResponseDto {
  status: 'proposed';
  operations: OperationDto[];
  conflicts: ConflictDto[];
  confidence: number;
}
