import { localTime } from '../time/local-time';
import { timeSlot } from './time-slot';
import { workingHours } from './working-hours';
import { appointment } from './appointment';
import { agenda } from './agenda';

describe('Agenda', () => {
  const wh = workingHours(localTime(9, 0), localTime(17, 0));

  const appt1 = appointment('appt-1', 'patient-1', timeSlot(localTime(14, 0), localTime(14, 30)));
  const appt2 = appointment('appt-2', 'patient-2', timeSlot(localTime(14, 30), localTime(15, 0)));
  const appt3 = appointment('appt-3', 'patient-3', timeSlot(localTime(15, 0), localTime(15, 30)));

  describe('sorting', () => {
    it('sorts appointments by slot.start ascending when given out of order', () => {
      const result = agenda([appt3, appt1, appt2], wh);
      expect(result.appointments[0].id).toBe('appt-1');
      expect(result.appointments[1].id).toBe('appt-2');
      expect(result.appointments[2].id).toBe('appt-3');
    });

    it('preserves order when already sorted', () => {
      const result = agenda([appt1, appt2, appt3], wh);
      expect(result.appointments.map((a) => a.id)).toEqual(['appt-1', 'appt-2', 'appt-3']);
    });
  });

  describe('immutability', () => {
    it('appointments array is frozen', () => {
      const result = agenda([appt1, appt2], wh);
      expect(Object.isFrozen(result.appointments)).toBe(true);
    });

    it('attempting to mutate appointments throws TypeError', () => {
      const result = agenda([appt1], wh);
      expect(() => {
        'use strict';
        (result as { appointments: unknown[] }).appointments = [];
      }).toThrow(TypeError);
    });

    it('the agenda itself is frozen', () => {
      const result = agenda([appt1], wh);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe('empty agenda', () => {
    it('constructs without error with no appointments', () => {
      expect(() => agenda([], wh)).not.toThrow();
    });

    it('has empty appointments array when no appointments given', () => {
      const result = agenda([], wh);
      expect(result.appointments).toHaveLength(0);
    });
  });
});
