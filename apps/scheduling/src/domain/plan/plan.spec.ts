import { localTime } from '../time/local-time';
import { timeSlot } from '../agenda/time-slot';
import { emptyPlan, planOf } from './plan';
import type { MovePlanOperation, Conflict } from './plan';

describe('Plan factories', () => {
  const fromSlot = timeSlot(localTime(14, 0), localTime(14, 30));
  const toSlot = timeSlot(localTime(14, 40), localTime(15, 10));

  const moveOp: MovePlanOperation = {
    type: 'move',
    appointmentId: 'appt-1',
    patientId: 'patient-1',
    from: fromSlot,
    to: toSlot,
  };

  const conflict: Conflict = {
    appointmentId: 'appt-5',
    reason: 'OVERFLOWS_CLOSING',
    proposedSlot: toSlot,
  };

  describe('emptyPlan()', () => {
    it('returns a plan with empty operations and conflicts', () => {
      const plan = emptyPlan();
      expect(plan.operations).toHaveLength(0);
      expect(plan.conflicts).toHaveLength(0);
    });

    it('operations array is frozen', () => {
      expect(Object.isFrozen(emptyPlan().operations)).toBe(true);
    });

    it('conflicts array is frozen', () => {
      expect(Object.isFrozen(emptyPlan().conflicts)).toBe(true);
    });
  });

  describe('planOf()', () => {
    it('returns a plan with the provided operations', () => {
      const plan = planOf([moveOp], []);
      expect(plan.operations).toHaveLength(1);
    });

    it('operations array is frozen (mutation throws)', () => {
      const plan = planOf([moveOp], []);
      expect(() => {
        'use strict';
        (plan.operations as unknown[]).push(moveOp);
      }).toThrow(TypeError);
    });

    it('carries correct type, appointmentId, patientId, from, and to on a move operation', () => {
      const plan = planOf([moveOp], []);
      const op = plan.operations[0] as MovePlanOperation;
      expect(op.type).toBe('move');
      expect(op.appointmentId).toBe('appt-1');
      expect(op.patientId).toBe('patient-1');
      expect(op.from).toBe(fromSlot);
      expect(op.to).toBe(toSlot);
    });

    it('carries correct conflict fields', () => {
      const plan = planOf([], [conflict]);
      const c = plan.conflicts[0];
      expect(c.appointmentId).toBe('appt-5');
      expect(c.reason).toBe('OVERFLOWS_CLOSING');
      expect(c.proposedSlot).toBe(toSlot);
    });

    it('the returned plan itself is frozen', () => {
      expect(Object.isFrozen(planOf([moveOp], [conflict]))).toBe(true);
    });
  });
});
