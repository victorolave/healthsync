import { localTime } from '../time/local-time';
import { timeSlot } from './time-slot';
import { workingHours, containsSlot, slotOverflowsClose } from './working-hours';

describe('WorkingHours', () => {
  const wh = workingHours(localTime(9, 0), localTime(17, 0));

  describe('containsSlot()', () => {
    it('returns true when slot is fully within working hours', () => {
      expect(containsSlot(wh, timeSlot(localTime(14, 0), localTime(14, 30)))).toBe(true);
    });

    it('returns false when slot starts before working hours open', () => {
      expect(containsSlot(wh, timeSlot(localTime(8, 30), localTime(9, 30)))).toBe(false);
    });

    it('returns false when slot ends after working hours close', () => {
      expect(containsSlot(wh, timeSlot(localTime(16, 45), localTime(17, 15)))).toBe(false);
    });

    it('returns true when slot ends exactly at close (inclusive close boundary)', () => {
      expect(containsSlot(wh, timeSlot(localTime(16, 30), localTime(17, 0)))).toBe(true);
    });

    it('returns true when slot starts exactly at open', () => {
      expect(containsSlot(wh, timeSlot(localTime(9, 0), localTime(9, 30)))).toBe(true);
    });
  });

  describe('slotOverflowsClose()', () => {
    it('returns true when slot end is after working hours close', () => {
      expect(slotOverflowsClose(wh, timeSlot(localTime(16, 0), localTime(17, 10)))).toBe(true);
    });

    it('returns false when slot end is exactly at working hours close', () => {
      expect(slotOverflowsClose(wh, timeSlot(localTime(16, 0), localTime(17, 0)))).toBe(false);
    });

    it('returns false when slot end is before working hours close', () => {
      expect(slotOverflowsClose(wh, timeSlot(localTime(14, 0), localTime(15, 0)))).toBe(false);
    });
  });

  describe('construction validation', () => {
    it('throws RangeError when close is before open (inverted hours)', () => {
      expect(() => workingHours(localTime(17, 0), localTime(9, 0))).toThrow(RangeError);
    });

    it('throws RangeError when close equals open (zero-duration working day)', () => {
      expect(() => workingHours(localTime(9, 0), localTime(9, 0))).toThrow(RangeError);
    });
  });

  describe('immutability', () => {
    it('the returned WorkingHours is frozen', () => {
      expect(Object.isFrozen(wh)).toBe(true);
    });
  });
});
