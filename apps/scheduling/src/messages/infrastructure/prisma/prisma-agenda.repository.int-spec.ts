/**
 * Integration spec for PrismaAgendaRepository.
 * REQUIRES a live DATABASE_URL pointing to a Neon (or compatible Postgres) DB
 * with the Phase 2 migrations applied.
 *
 * Self-skips when DATABASE_URL is absent so `pnpm test` stays GREEN offline.
 * To run locally: DATABASE_URL=postgresql://... pnpm test -- prisma-agenda.repository.int-spec
 */
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

import { PrismaService } from './prisma.service';
import { PrismaAgendaRepository } from './prisma-agenda.repository';

describeIfDb('PrismaAgendaRepository (integration)', () => {
  let prisma: PrismaService;
  let repo: PrismaAgendaRepository;

  const DOCTOR_ID = '00000000-0000-0000-0000-000000000001';
  const TODAY = new Date('2024-01-15T00:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    repo = new PrismaAgendaRepository(prisma);
  });

  afterAll(async () => {
    await prisma.workingHours.deleteMany({ where: { doctorId: DOCTOR_ID } });
    await prisma.appointment.deleteMany({ where: { doctorId: DOCTOR_ID } });
    await prisma.onModuleDestroy();
  });

  it('returns null when no working_hours row exists for the date', async () => {
    const result = await repo.findAgendaForDate(DOCTOR_ID, TODAY);
    expect(result).toBeNull();
  });

  it('returns an Agenda when working_hours exists (no appointments)', async () => {
    await prisma.workingHours.create({
      data: {
        id: 'wh-test-id-1',
        doctorId: DOCTOR_ID,
        day: TODAY,
        openTime: new Date('1970-01-01T08:00:00.000Z'),
        closeTime: new Date('1970-01-01T17:00:00.000Z'),
      },
    });

    const result = await repo.findAgendaForDate(DOCTOR_ID, TODAY);

    expect(result).not.toBeNull();
    expect(result!.workingHours.open.toString()).toBe('08:00');
    expect(result!.workingHours.close.toString()).toBe('17:00');
    expect(result!.appointments).toHaveLength(0);
  });

  it('includes appointments sorted by start time', async () => {
    await prisma.appointment.createMany({
      data: [
        {
          id: 'appt-test-2',
          doctorId: DOCTOR_ID,
          patientId: 'p-2',
          day: TODAY,
          startTime: new Date('1970-01-01T11:00:00.000Z'),
          endTime: new Date('1970-01-01T11:30:00.000Z'),
        },
        {
          id: 'appt-test-1',
          doctorId: DOCTOR_ID,
          patientId: 'p-1',
          day: TODAY,
          startTime: new Date('1970-01-01T09:00:00.000Z'),
          endTime: new Date('1970-01-01T09:30:00.000Z'),
        },
      ],
    });

    const result = await repo.findAgendaForDate(DOCTOR_ID, TODAY);

    expect(result!.appointments).toHaveLength(2);
    expect(result!.appointments[0].slot.start.toString()).toBe('09:00');
    expect(result!.appointments[1].slot.start.toString()).toBe('11:00');
  });

  it('rejects overlapping appointments via no_double_booking constraint', async () => {
    // Overlapping appointment (09:15–09:45 overlaps existing 09:00–09:30)
    await expect(
      prisma.appointment.create({
        data: {
          id: 'appt-overlap',
          doctorId: DOCTOR_ID,
          patientId: 'p-3',
          day: TODAY,
          startTime: new Date('1970-01-01T09:15:00.000Z'),
          endTime: new Date('1970-01-01T09:45:00.000Z'),
        },
      }),
    ).rejects.toThrow();
  });
});
