import type { Agenda } from '../agenda/agenda';
import { shiftBy } from '../agenda/time-slot';
import { slotOverflowsClose } from '../agenda/working-hours';
import type { Intent } from '../intent/intent';
import type { Conflict, MovePlanOperation, PlanOperation } from '../plan/plan';
import { planOf } from '../plan/plan';
import type { Planner } from './planner';
import type { Plan } from '../plan/plan';

export class DelayPlanner implements Planner {
  plan(agenda: Agenda, intent: Intent): Plan {
    const minutes = this.readMinutes(intent);

    const operations: PlanOperation[] = [];
    const conflicts: Conflict[] = [];

    for (const appt of agenda.appointments) {
      const movedSlot = shiftBy(appt.slot, minutes);

      const moveOp: MovePlanOperation = {
        type: 'move',
        appointmentId: appt.id,
        patientId: appt.patientId,
        from: appt.slot,
        to: movedSlot,
      };
      operations.push(moveOp);

      if (slotOverflowsClose(agenda.workingHours, movedSlot)) {
        conflicts.push({
          appointmentId: appt.id,
          reason: 'OVERFLOWS_CLOSING',
          proposedSlot: movedSlot,
        });
      }
    }

    return planOf(operations, conflicts);
  }

  private readMinutes(intent: Intent): number {
    const raw = intent.params['minutes'];

    if (
      typeof raw !== 'number' ||
      !Number.isFinite(raw) ||
      !Number.isInteger(raw) ||
      raw <= 0
    ) {
      throw new RangeError(
        `params.minutes must be a positive integer, got ${JSON.stringify(raw)}`,
      );
    }

    return raw;
  }
}
