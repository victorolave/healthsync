import type { LocalTime } from '../time/local-time';

export interface TimeSlot {
  readonly start: LocalTime;
  readonly end: LocalTime;
}

export function timeSlot(start: LocalTime, end: LocalTime): TimeSlot {
  if (end.compareTo(start) <= 0) {
    throw new RangeError(
      `TimeSlot end (${end.toString()}) must be after start (${start.toString()})`,
    );
  }
  return Object.freeze({ start, end });
}

/**
 * Half-open interval overlap: [a.start, a.end) ∩ [b.start, b.end) ≠ ∅
 * Two adjacent slots do NOT overlap.
 */
export function overlaps(a: TimeSlot, b: TimeSlot): boolean {
  return a.start.compareTo(b.end) < 0 && b.start.compareTo(a.end) < 0;
}

export function shiftBy(slot: TimeSlot, minutes: number): TimeSlot {
  return timeSlot(slot.start.plusMinutes(minutes), slot.end.plusMinutes(minutes));
}
