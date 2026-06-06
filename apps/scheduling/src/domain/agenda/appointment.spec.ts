import { localTime } from '../time/local-time';
import { timeSlot } from './time-slot';
import { appointment, withSlot } from './appointment';

describe('Appointment', () => {
  const slot1 = timeSlot(localTime(14, 0), localTime(14, 30));
  const slot2 = timeSlot(localTime(15, 0), localTime(15, 30));

  describe('appointment() construction', () => {
    it('constructs a frozen appointment object', () => {
      const appt = appointment('appt-1', 'patient-1', slot1);
      expect(appt.id).toBe('appt-1');
      expect(appt.patientId).toBe('patient-1');
      expect(appt.slot).toBe(slot1);
      expect(Object.isFrozen(appt)).toBe(true);
    });
  });

  describe('withSlot()', () => {
    it('returns a new appointment with the new slot', () => {
      const appt = appointment('appt-1', 'patient-1', slot1);
      const updated = withSlot(appt, slot2);
      expect(updated.slot).toBe(slot2);
    });

    it('preserves id and patientId on the new appointment', () => {
      const appt = appointment('appt-1', 'patient-1', slot1);
      const updated = withSlot(appt, slot2);
      expect(updated.id).toBe('appt-1');
      expect(updated.patientId).toBe('patient-1');
    });

    it('does not mutate the original appointment', () => {
      const appt = appointment('appt-1', 'patient-1', slot1);
      withSlot(appt, slot2);
      expect(appt.slot).toBe(slot1);
    });

    it('returns a frozen appointment', () => {
      const appt = appointment('appt-1', 'patient-1', slot1);
      expect(Object.isFrozen(withSlot(appt, slot2))).toBe(true);
    });
  });

  describe('immutability', () => {
    it('attempting to mutate id in strict mode throws TypeError', () => {
      const appt = appointment('appt-1', 'patient-1', slot1);
      expect(() => {
        'use strict';
        (appt as { id: string }).id = 'changed';
      }).toThrow(TypeError);
    });
  });
});
