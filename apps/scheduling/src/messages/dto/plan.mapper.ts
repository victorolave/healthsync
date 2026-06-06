import type { Plan } from '../../domain';
import type {
  PlanResponseDto,
  OperationDto,
  ConflictDto,
  TimeSlotDto,
} from './plan-response.dto';
import type { TimeSlot } from '../../domain';

/**
 * Maps a domain Plan to a PlanResponseDto.
 *
 * SERIALIZATION GOTCHA: JSON.stringify does NOT call toString() on nested
 * class instances (LocalTime). We must explicitly call .toString() on every
 * LocalTime so the DTO contains plain HH:MM strings, not empty objects.
 */
function mapTimeSlot(slot: TimeSlot): TimeSlotDto {
  return {
    start: slot.start.toString(),
    end: slot.end.toString(),
  };
}

function mapOperations(plan: Plan): OperationDto[] {
  return plan.operations.map((op) => ({
    type: op.type,
    appointmentId: op.appointmentId,
    patientId: op.patientId,
    from: mapTimeSlot(op.from),
    to: mapTimeSlot(op.to),
  }));
}

function mapConflicts(plan: Plan): ConflictDto[] {
  return plan.conflicts.map((c) => ({
    appointmentId: c.appointmentId,
    reason: c.reason,
    proposedSlot: mapTimeSlot(c.proposedSlot),
  }));
}

export function mapPlanToDto(plan: Plan, confidence: number): PlanResponseDto {
  return {
    status: 'proposed',
    operations: mapOperations(plan),
    conflicts: mapConflicts(plan),
    confidence,
  };
}
