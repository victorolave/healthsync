import { localTime } from '../time/local-time';
import { timeSlot } from '../agenda/time-slot';
import { workingHours } from '../agenda/working-hours';
import { appointment } from '../agenda/appointment';
import { agenda } from '../agenda/agenda';
import { DelayPlanner } from './delay-planner';
import type { MovePlanOperation } from '../plan/plan';

describe('DelayPlanner', () => {
  const wh = workingHours(localTime(9, 0), localTime(17, 0));

  const appt1 = appointment('appt-1', 'patient-1', timeSlot(localTime(14, 0), localTime(14, 30)));
  const appt2 = appointment('appt-2', 'patient-2', timeSlot(localTime(14, 30), localTime(15, 0)));

  const baseAgenda = agenda([appt1, appt2], wh);
  const planner = new DelayPlanner();

  describe('valid delay', () => {
    it('shifts all appointments by the given minutes', () => {
      const plan = planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: 40 } });
      expect(plan.operations).toHaveLength(2);

      const op1 = plan.operations[0] as MovePlanOperation;
      expect(op1.type).toBe('move');
      expect(op1.from.start.toString()).toBe('14:00');
      expect(op1.from.end.toString()).toBe('14:30');
      expect(op1.to.start.toString()).toBe('14:40');
      expect(op1.to.end.toString()).toBe('15:10');

      const op2 = plan.operations[1] as MovePlanOperation;
      expect(op2.to.start.toString()).toBe('15:10');
      expect(op2.to.end.toString()).toBe('15:40');
    });

    it('carries correct appointmentId and patientId on each operation', () => {
      const plan = planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: 40 } });
      const op1 = plan.operations[0] as MovePlanOperation;
      expect(op1.appointmentId).toBe('appt-1');
      expect(op1.patientId).toBe('patient-1');
    });
  });

  describe('overflow detection', () => {
    it('adds OVERFLOWS_CLOSING conflict when shifted end > wh.close', () => {
      const lateAppt = appointment('appt-5', 'patient-5', timeSlot(localTime(16, 0), localTime(16, 30)));
      const lateAgenda = agenda([lateAppt], wh);
      const plan = planner.plan(lateAgenda, { kind: 'DELAY', params: { minutes: 40 } });

      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].reason).toBe('OVERFLOWS_CLOSING');
      expect(plan.conflicts[0].appointmentId).toBe('appt-5');
      expect(plan.conflicts[0].proposedSlot.end.toString()).toBe('17:10');
    });

    it('does NOT add a conflict when shifted end equals wh.close exactly', () => {
      // 16:00–16:30 + 30 min = 16:30–17:00, end === close → no overflow
      const borderAppt = appointment('appt-b', 'patient-b', timeSlot(localTime(16, 0), localTime(16, 30)));
      const borderAgenda = agenda([borderAppt], wh);
      const plan = planner.plan(borderAgenda, { kind: 'DELAY', params: { minutes: 30 } });

      expect(plan.conflicts).toHaveLength(0);
    });

    it('does NOT add a conflict for appointments that fit within working hours', () => {
      const plan = planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: 40 } });
      expect(plan.conflicts).toHaveLength(0);
    });
  });

  describe('invalid minutes validation', () => {
    it('throws RangeError when minutes is 0', () => {
      expect(() =>
        planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: 0 } }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when minutes is negative', () => {
      expect(() =>
        planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: -5 } }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when minutes is a string', () => {
      expect(() =>
        planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: 'forty' } }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when minutes is a non-integer float', () => {
      expect(() =>
        planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: 1.5 } }),
      ).toThrow(RangeError);
    });

    it('throws RangeError when minutes is Infinity', () => {
      expect(() =>
        planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: Infinity } }),
      ).toThrow(RangeError);
    });
  });

  describe('immutability', () => {
    it('does not mutate the original agenda appointments', () => {
      const originalSlot = baseAgenda.appointments[0].slot;
      planner.plan(baseAgenda, { kind: 'DELAY', params: { minutes: 40 } });
      expect(baseAgenda.appointments[0].slot).toBe(originalSlot);
    });
  });
});
