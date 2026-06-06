import { toLocalTime, toAgenda } from './agenda.mapper';
import { localTime } from '../../../domain';

// Prisma returns TIME(0) columns as Date objects anchored at 1970-01-01T00:00:00Z.
// We MUST read UTC hours/minutes to dodge timezone traps on non-UTC hosts.
describe('toLocalTime', () => {
  it('converts a Prisma TIME Date (09:30 UTC) to LocalTime 09:30', () => {
    const prismaDate = new Date('1970-01-01T09:30:00.000Z');
    const result = toLocalTime(prismaDate);
    expect(result.toString()).toBe('09:30');
  });

  it('converts 00:00 UTC to LocalTime 00:00', () => {
    const prismaDate = new Date('1970-01-01T00:00:00.000Z');
    expect(toLocalTime(prismaDate).toString()).toBe('00:00');
  });

  it('converts 23:59 UTC to LocalTime 23:59', () => {
    const prismaDate = new Date('1970-01-01T23:59:00.000Z');
    expect(toLocalTime(prismaDate).toString()).toBe('23:59');
  });

  it('reads UTC hours/minutes (not local time) to avoid timezone trap', () => {
    // Simulate a host that might have a non-UTC offset: we control the UTC value
    const prismaDate = new Date('1970-01-01T08:00:00.000Z');
    const result = toLocalTime(prismaDate);
    // Must equal 08:00 regardless of process.env.TZ
    expect(result.equals(localTime(8, 0))).toBe(true);
  });
});

describe('toAgenda', () => {
  const makeTime = (isoTime: string) => new Date(`1970-01-01T${isoTime}:00.000Z`);

  const whRow = {
    id: 'wh-id',
    doctorId: 'doc-id',
    day: new Date('2024-01-15T00:00:00.000Z'),
    openTime: makeTime('08:00'),
    closeTime: makeTime('17:00'),
  };

  it('returns an Agenda with correct workingHours', () => {
    const ag = toAgenda(whRow, []);
    expect(ag.workingHours.open.toString()).toBe('08:00');
    expect(ag.workingHours.close.toString()).toBe('17:00');
  });

  it('returns empty appointments when apptRows is empty', () => {
    const ag = toAgenda(whRow, []);
    expect(ag.appointments).toHaveLength(0);
  });

  it('maps appointment rows to Appointment domain objects sorted by start', () => {
    const apptRows = [
      {
        id: 'appt-2',
        doctorId: 'doc-id',
        patientId: 'p-2',
        day: new Date('2024-01-15T00:00:00.000Z'),
        startTime: makeTime('11:00'),
        endTime: makeTime('11:30'),
      },
      {
        id: 'appt-1',
        doctorId: 'doc-id',
        patientId: 'p-1',
        day: new Date('2024-01-15T00:00:00.000Z'),
        startTime: makeTime('09:00'),
        endTime: makeTime('09:30'),
      },
    ];

    const ag = toAgenda(whRow, apptRows);

    expect(ag.appointments).toHaveLength(2);
    expect(ag.appointments[0].slot.start.toString()).toBe('09:00');
    expect(ag.appointments[1].slot.start.toString()).toBe('11:00');
    expect(ag.appointments[0].id).toBe('appt-1');
  });
});
