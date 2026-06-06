import { localTime } from '../time/local-time';
import { timeSlot } from '../agenda/time-slot';
import { workingHours } from '../agenda/working-hours';
import { appointment } from '../agenda/appointment';
import { agenda } from '../agenda/agenda';
import { emptyPlan, planOf } from '../plan/plan';
import { UnsupportedIntentError } from '../intent/unsupported-intent.error';
import type { Planner } from './planner';
import type { PlannerRegistry } from './planner-registry';
import { recalculate } from './recalculate';

describe('recalculate()', () => {
  const wh = workingHours(localTime(9, 0), localTime(17, 0));
  const appt1 = appointment('appt-1', 'patient-1', timeSlot(localTime(14, 0), localTime(14, 30)));
  const testAgenda = agenda([appt1], wh);

  const stubPlan = emptyPlan();

  const stubPlanner: Planner = {
    plan: jest.fn().mockReturnValue(stubPlan),
  };

  const registry: PlannerRegistry = new Map([['DELAY', stubPlanner]]);

  beforeEach(() => {
    jest.clearAllMocks();
    (stubPlanner.plan as jest.Mock).mockReturnValue(stubPlan);
  });

  describe('known intent kind', () => {
    it('delegates to the registered planner and returns its result', () => {
      const intent = { kind: 'DELAY', params: { minutes: 40 } };
      const result = recalculate(registry, testAgenda, intent);
      expect(result).toBe(stubPlan);
    });

    it('calls the planner.plan with the agenda and intent', () => {
      const intent = { kind: 'DELAY', params: { minutes: 40 } };
      recalculate(registry, testAgenda, intent);
      expect(stubPlanner.plan).toHaveBeenCalledWith(testAgenda, intent);
    });

    it('returns the exact value the planner returned (pass-through)', () => {
      const customPlan = planOf([], []);
      (stubPlanner.plan as jest.Mock).mockReturnValue(customPlan);
      const result = recalculate(registry, testAgenda, { kind: 'DELAY', params: {} });
      expect(result).toBe(customPlan);
    });
  });

  describe('unknown intent kind', () => {
    it('throws UnsupportedIntentError for an unregistered kind', () => {
      const intent = { kind: 'RESCHEDULE', params: {} };
      expect(() => recalculate(registry, testAgenda, intent)).toThrow(UnsupportedIntentError);
    });

    it('thrown error carries the correct .kind', () => {
      const intent = { kind: 'RESCHEDULE', params: {} };
      expect(() => recalculate(registry, testAgenda, intent)).toThrow(
        expect.objectContaining({ kind: 'RESCHEDULE' }),
      );
    });

    it('the thrown UnsupportedIntentError is also an instance of Error', () => {
      try {
        recalculate(registry, testAgenda, { kind: 'UNKNOWN', params: {} });
        fail('expected to throw');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(UnsupportedIntentError);
      }
    });
  });
});
