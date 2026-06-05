export class LocalTime {
  private readonly minutesSinceMidnight: number;

  private constructor(minutesSinceMidnight: number) {
    this.minutesSinceMidnight = minutesSinceMidnight;
  }

  static of(h: number, m: number): LocalTime {
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      throw new RangeError(`Hour must be in [0, 23], got ${h}`);
    }
    if (!Number.isInteger(m) || m < 0 || m > 59) {
      throw new RangeError(`Minute must be in [0, 59], got ${m}`);
    }
    return new LocalTime(h * 60 + m);
  }

  plusMinutes(n: number): LocalTime {
    const result = this.minutesSinceMidnight + n;
    if (result > 23 * 60 + 59) {
      throw new RangeError(
        `plusMinutes(${n}) overflows past 23:59 from ${this.toString()}`,
      );
    }
    return new LocalTime(result);
  }

  isAfter(other: LocalTime): boolean {
    return this.minutesSinceMidnight > other.minutesSinceMidnight;
  }

  compareTo(other: LocalTime): number {
    return this.minutesSinceMidnight - other.minutesSinceMidnight;
  }

  equals(other: LocalTime): boolean {
    return this.minutesSinceMidnight === other.minutesSinceMidnight;
  }

  toString(): string {
    const h = Math.floor(this.minutesSinceMidnight / 60);
    const m = this.minutesSinceMidnight % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

export function localTime(h: number, m: number): LocalTime {
  return LocalTime.of(h, m);
}
