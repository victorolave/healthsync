import { InMemoryAgendaRepository } from './in-memory-agenda.repository';
import { agenda, workingHours, localTime } from '../../domain';

describe('InMemoryAgendaRepository', () => {
  const TODAY = new Date('1970-01-05T00:00:00.000Z');
  const DOCTOR_ID = '00000000-0000-0000-0000-000000000001';

  it('returns null when no agenda is seeded for the given date', async () => {
    const repo = new InMemoryAgendaRepository();

    const result = await repo.findAgendaForDate(DOCTOR_ID, TODAY);

    expect(result).toBeNull();
  });

  it('returns the seeded agenda for the matching doctorId + date', async () => {
    const repo = new InMemoryAgendaRepository();
    const wh = workingHours(localTime(8, 0), localTime(17, 0));
    const ag = agenda([], wh);
    repo.seed(DOCTOR_ID, TODAY, ag);

    const result = await repo.findAgendaForDate(DOCTOR_ID, TODAY);

    expect(result).toBe(ag);
  });

  it('returns null when doctorId matches but date does not', async () => {
    const repo = new InMemoryAgendaRepository();
    const wh = workingHours(localTime(8, 0), localTime(17, 0));
    const ag = agenda([], wh);
    repo.seed(DOCTOR_ID, TODAY, ag);

    const otherDate = new Date('1970-01-06T00:00:00.000Z');
    const result = await repo.findAgendaForDate(DOCTOR_ID, otherDate);

    expect(result).toBeNull();
  });

  it('satisfies the AgendaRepository port contract (findAgendaForDate present)', () => {
    const repo = new InMemoryAgendaRepository();
    expect(typeof repo.findAgendaForDate).toBe('function');
  });

  it('satisfies the AgendaRepository port contract (saveAgenda present)', () => {
    const repo = new InMemoryAgendaRepository();
    expect(typeof repo.saveAgenda).toBe('function');
  });

  it('persists an agenda via saveAgenda and retrieves it with findAgendaForDate', async () => {
    const repo = new InMemoryAgendaRepository();
    const wh = workingHours(localTime(8, 0), localTime(17, 0));
    const ag = agenda([], wh);

    await repo.saveAgenda(DOCTOR_ID, TODAY, ag);
    const result = await repo.findAgendaForDate(DOCTOR_ID, TODAY);

    expect(result).toBe(ag);
  });
});
