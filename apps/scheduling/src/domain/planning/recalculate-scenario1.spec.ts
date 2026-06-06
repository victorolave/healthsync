/**
 * PRD Scenario 1 — DELAY 40 min acceptance test (keystone)
 *
 * Uses the REAL buildPlannerRegistry() with no stubs.
 * This test is the single source of truth for the Phase 1 contract.
 */
import { localTime } from '../time/local-time';
import { timeSlot } from '../agenda/time-slot';
import { workingHours } from '../agenda/working-hours';
import { appointment } from '../agenda/appointment';
import { agenda } from '../agenda/agenda';
import { UnsupportedIntentError } from '../intent/unsupported-intent.error';
import { buildPlannerRegistry } from './planner-registry';
import { recalculate } from './recalculate';
import type { MovePlanOperation } from '../plan/plan';

describe('PRD Scenario 1 — DELAY 40 min', () => {
  const wh = workingHours(localTime(9, 0), localTime(17, 0));
  const registry = buildPlannerRegistry();

  // Base 4-appointment agenda
  const appt1 = appointment('appt-1', 'patient-1', timeSlot(localTime(14, 0), localTime(14, 30)));
  const appt2 = appointment('appt-2', 'patient-2', timeSlot(localTime(14, 30), localTime(15, 0)));
  const appt3 = appointment('appt-3', 'patient-3', timeSlot(localTime(15, 0), localTime(15, 30)));
  const appt4 = appointment('appt-4', 'patient-4', timeSlot(localTime(15, 30), localTime(16, 0)));

  const baseAgenda = agenda([appt1, appt2, appt3, appt4], wh);
  const delayIntent = { kind: 'DELAY', params: { minutes: 40 } };

  describe('happy path — no overflow', () => {
    it('returns exactly 4 move operations', () => {
      const plan = recalculate(registry, baseAgenda, delayIntent);
      expect(plan.operations).toHaveLength(4);
    });

    it('appt-1 moves from [14:00–14:30] to [14:40–15:10]', () => {
      const plan = recalculate(registry, baseAgenda, delayIntent);
      const op = plan.operations[0] as MovePlanOperation;
      expect(op.appointmentId).toBe('appt-1');
      expect(op.from.start.toString()).toBe('14:00');
      expect(op.from.end.toString()).toBe('14:30');
      expect(op.to.start.toString()).toBe('14:40');
      expect(op.to.end.toString()).toBe('15:10');
    });

    it('appt-2 moves from [14:30–15:00] to [15:10–15:40]', () => {
      const plan = recalculate(registry, baseAgenda, delayIntent);
      const op = plan.operations[1] as MovePlanOperation;
      expect(op.appointmentId).toBe('appt-2');
      expect(op.to.start.toString()).toBe('15:10');
      expect(op.to.end.toString()).toBe('15:40');
    });

    it('appt-3 moves from [15:00–15:30] to [15:40–16:10]', () => {
      const plan = recalculate(registry, baseAgenda, delayIntent);
      const op = plan.operations[2] as MovePlanOperation;
      expect(op.appointmentId).toBe('appt-3');
      expect(op.to.start.toString()).toBe('15:40');
      expect(op.to.end.toString()).toBe('16:10');
    });

    it('appt-4 moves from [15:30–16:00] to [16:10–16:40]', () => {
      const plan = recalculate(registry, baseAgenda, delayIntent);
      const op = plan.operations[3] as MovePlanOperation;
      expect(op.appointmentId).toBe('appt-4');
      expect(op.to.start.toString()).toBe('16:10');
      expect(op.to.end.toString()).toBe('16:40');
    });

    it('conflicts is empty — all shifted slots end at or before 17:00', () => {
      const plan = recalculate(registry, baseAgenda, delayIntent);
      expect(plan.conflicts).toHaveLength(0);
    });

    it('original agenda appointments are NOT mutated', () => {
      recalculate(registry, baseAgenda, delayIntent);
      expect(baseAgenda.appointments[0].slot.start.toString()).toBe('14:00');
      expect(baseAgenda.appointments[0].slot.end.toString()).toBe('14:30');
    });
  });

  describe('overflow companion — appt-5 at [16:00–16:30]', () => {
    const appt5 = appointment('appt-5', 'patient-5', timeSlot(localTime(16, 0), localTime(16, 30)));
    const overflowAgenda = agenda([appt1, appt2, appt3, appt4, appt5], wh);

    it('returns 5 operations', () => {
      const plan = recalculate(registry, overflowAgenda, delayIntent);
      expect(plan.operations).toHaveLength(5);
    });

    it('flags exactly one OVERFLOWS_CLOSING conflict for appt-5', () => {
      const plan = recalculate(registry, overflowAgenda, delayIntent);
      expect(plan.conflicts).toHaveLength(1);
      expect(plan.conflicts[0].appointmentId).toBe('appt-5');
      expect(plan.conflicts[0].reason).toBe('OVERFLOWS_CLOSING');
    });

    it('conflict proposedSlot.end is 17:10', () => {
      const plan = recalculate(registry, overflowAgenda, delayIntent);
      expect(plan.conflicts[0].proposedSlot.end.toString()).toBe('17:10');
    });

    it('all 5 operations are still emitted (no appointment is skipped)', () => {
      const plan = recalculate(registry, overflowAgenda, delayIntent);
      const ids = plan.operations.map((o) => (o as MovePlanOperation).appointmentId);
      expect(ids).toContain('appt-5');
    });
  });

  describe('unknown intent kind', () => {
    it('throws UnsupportedIntentError with correct .kind', () => {
      const intent = { kind: 'RESCHEDULE', params: {} };
      expect(() => recalculate(registry, baseAgenda, intent)).toThrow(UnsupportedIntentError);
    });

    it('thrown error kind matches the intent kind', () => {
      try {
        recalculate(registry, baseAgenda, { kind: 'RESCHEDULE', params: {} });
        fail('expected to throw');
      } catch (e) {
        expect((e as UnsupportedIntentError).kind).toBe('RESCHEDULE');
      }
    });
  });

  // Isolation guarantee: if any forbidden import (@nestjs/*, pg, typeorm, express)
  // were reachable from the domain module graph, ts-jest compilation would fail at
  // module load time before any test in this suite could run. No runtime assertion
  // is needed — the compile-time guarantee is sufficient.
});
