import type { Agenda } from '../../domain';
import type { AgendaRepository } from '../application/agenda.repository';

/**
 * In-memory implementation of AgendaRepository. Used in unit tests and e2e
 * tests to avoid any database dependency (ADR-0002: no DB in unit/e2e).
 * Seed data with `seed(doctorId, date, agenda)` before each test.
 */
export class InMemoryAgendaRepository implements AgendaRepository {
  private readonly store = new Map<string, Agenda>();

  private key(doctorId: string, date: Date): string {
    return `${doctorId}:${date.toISOString().slice(0, 10)}`;
  }

  seed(doctorId: string, date: Date, ag: Agenda): void {
    this.store.set(this.key(doctorId, date), ag);
  }

  async findAgendaForDate(doctorId: string, date: Date): Promise<Agenda | null> {
    return this.store.get(this.key(doctorId, date)) ?? null;
  }

  async saveAgenda(doctorId: string, date: Date, ag: Agenda): Promise<void> {
    this.store.set(this.key(doctorId, date), ag);
  }
}
