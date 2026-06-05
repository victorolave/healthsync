import { localTime } from '../time/local-time';
import { timeSlot, overlaps, shiftBy } from './time-slot';

describe('TimeSlot', () => {
  describe('timeSlot() construction', () => {
    it('constructs without error when end > start', () => {
      expect(() => timeSlot(localTime(14, 0), localTime(14, 30))).not.toThrow();
    });

    it('throws RangeError when end < start', () => {
      expect(() => timeSlot(localTime(14, 30), localTime(14, 0))).toThrow(RangeError);
    });

    it('throws RangeError when start equals end', () => {
      expect(() => timeSlot(localTime(14, 0), localTime(14, 0))).toThrow(RangeError);
    });
  });

  describe('overlaps()', () => {
    it('returns true when slots overlap in the middle', () => {
      const a = timeSlot(localTime(14, 0), localTime(14, 30));
      const b = timeSlot(localTime(14, 15), localTime(14, 45));
      expect(overlaps(a, b)).toBe(true);
    });

    it('returns false when slots are adjacent (half-open: [start, end))', () => {
      const a = timeSlot(localTime(14, 0), localTime(14, 30));
      const b = timeSlot(localTime(14, 30), localTime(15, 0));
      expect(overlaps(a, b)).toBe(false);
    });

    it('returns false when first slot ends before second starts', () => {
      const a = timeSlot(localTime(14, 0), localTime(14, 30));
      const b = timeSlot(localTime(15, 0), localTime(15, 30));
      expect(overlaps(a, b)).toBe(false);
    });

    it('returns true when one slot fully contains the other', () => {
      const a = timeSlot(localTime(14, 0), localTime(16, 0));
      const b = timeSlot(localTime(14, 30), localTime(15, 30));
      expect(overlaps(a, b)).toBe(true);
    });
  });

  describe('shiftBy()', () => {
    it('shifts [14:00–14:30] by 40 minutes to [14:40–15:10]', () => {
      const slot = timeSlot(localTime(14, 0), localTime(14, 30));
      const shifted = shiftBy(slot, 40);
      expect(shifted.start.toString()).toBe('14:40');
      expect(shifted.end.toString()).toBe('15:10');
    });

    it('does not mutate the original slot', () => {
      const slot = timeSlot(localTime(14, 0), localTime(14, 30));
      shiftBy(slot, 40);
      expect(slot.start.toString()).toBe('14:00');
      expect(slot.end.toString()).toBe('14:30');
    });
  });

  describe('immutability', () => {
    it('the returned slot is frozen', () => {
      const slot = timeSlot(localTime(14, 0), localTime(14, 30));
      expect(Object.isFrozen(slot)).toBe(true);
    });
  });
});
