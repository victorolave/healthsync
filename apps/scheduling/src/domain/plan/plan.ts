import type { TimeSlot } from '../agenda/time-slot';

export interface MovePlanOperation {
  readonly type: 'move';
  readonly appointmentId: string;
  readonly patientId: string;
  readonly from: TimeSlot;
  readonly to: TimeSlot;
}

export type PlanOperation = MovePlanOperation;

export interface Conflict {
  readonly appointmentId: string;
  readonly reason: 'OVERFLOWS_CLOSING';
  readonly proposedSlot: TimeSlot;
}

export interface Plan {
  readonly operations: readonly PlanOperation[];
  readonly conflicts: readonly Conflict[];
}

export function emptyPlan(): Plan {
  return Object.freeze({
    operations: Object.freeze([]) as readonly PlanOperation[],
    conflicts: Object.freeze([]) as readonly Conflict[],
  });
}

export function planOf(operations: PlanOperation[], conflicts: Conflict[]): Plan {
  return Object.freeze({
    operations: Object.freeze([...operations]) as readonly PlanOperation[],
    conflicts: Object.freeze([...conflicts]) as readonly Conflict[],
  });
}
