import type { LocalTime } from '../time/local-time';
import type { TimeSlot } from './time-slot';

export interface WorkingHours {
  readonly open: LocalTime;
  readonly close: LocalTime;
}

export function workingHours(open: LocalTime, close: LocalTime): WorkingHours {
  if (close.compareTo(open) <= 0) {
    throw new RangeError(
      `WorkingHours close (${close.toString()}) must be strictly after open (${open.toString()})`,
    );
  }
  return Object.freeze({ open, close });
}

/**
 * A slot is contained when:
 *   slot.start >= wh.open  AND  slot.end <= wh.close
 */
export function containsSlot(wh: WorkingHours, slot: TimeSlot): boolean {
  return slot.start.compareTo(wh.open) >= 0 && slot.end.compareTo(wh.close) <= 0;
}

/**
 * A slot overflows close when its end is strictly after wh.close.
 */
export function slotOverflowsClose(wh: WorkingHours, slot: TimeSlot): boolean {
  return slot.end.isAfter(wh.close);
}
