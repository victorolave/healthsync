import { LocalTime, localTime } from './local-time';

describe('LocalTime', () => {
  describe('of() / localTime() construction', () => {
    it('constructs without error for valid h and m', () => {
      expect(() => localTime(14, 0)).not.toThrow();
    });

    it('throws RangeError for negative hours', () => {
      expect(() => localTime(-1, 0)).toThrow(RangeError);
    });

    it('throws RangeError for hours > 23', () => {
      expect(() => localTime(24, 0)).toThrow(RangeError);
    });

    it('throws RangeError for minutes >= 60', () => {
      expect(() => localTime(0, 60)).toThrow(RangeError);
    });

    it('throws RangeError for negative minutes', () => {
      expect(() => localTime(0, -1)).toThrow(RangeError);
    });
  });

  describe('plusMinutes()', () => {
    it('returns a new LocalTime equal to 14:30 when +30 from 14:00', () => {
      const t = localTime(14, 0).plusMinutes(30);
      expect(t.toString()).toBe('14:30');
    });

    it('does not mutate the original instance', () => {
      const original = localTime(14, 0);
      original.plusMinutes(30);
      expect(original.toString()).toBe('14:00');
    });

    it('throws RangeError when result overflows past midnight (23:30 + 40)', () => {
      expect(() => localTime(23, 30).plusMinutes(40)).toThrow(RangeError);
    });
  });

  describe('isAfter()', () => {
    it('returns true when this time is later than the argument', () => {
      expect(localTime(15, 0).isAfter(localTime(14, 0))).toBe(true);
    });

    it('returns false when this time is earlier than the argument', () => {
      expect(localTime(14, 0).isAfter(localTime(15, 0))).toBe(false);
    });

    it('returns false when times are equal', () => {
      expect(localTime(14, 0).isAfter(localTime(14, 0))).toBe(false);
    });
  });

  describe('toString()', () => {
    it('formats as HH:MM with zero-padding', () => {
      expect(localTime(14, 5).toString()).toBe('14:05');
    });

    it('formats midnight as 00:00', () => {
      expect(localTime(0, 0).toString()).toBe('00:00');
    });

    it('formats 23:59 correctly', () => {
      expect(localTime(23, 59).toString()).toBe('23:59');
    });
  });

  describe('compareTo()', () => {
    it('returns negative when this is earlier than other', () => {
      expect(localTime(14, 0).compareTo(localTime(15, 0))).toBeLessThan(0);
    });

    it('returns positive when this is later than other', () => {
      expect(localTime(15, 0).compareTo(localTime(14, 0))).toBeGreaterThan(0);
    });

    it('returns zero when times are equal', () => {
      expect(localTime(14, 0).compareTo(localTime(14, 0))).toBe(0);
    });
  });

  describe('equals()', () => {
    it('returns true for equal times', () => {
      expect(localTime(14, 0).equals(localTime(14, 0))).toBe(true);
    });

    it('returns false for different times', () => {
      expect(localTime(14, 0).equals(localTime(14, 1))).toBe(false);
    });
  });

  describe('instanceof', () => {
    it('is an instance of LocalTime', () => {
      expect(localTime(14, 0)).toBeInstanceOf(LocalTime);
    });
  });
});
