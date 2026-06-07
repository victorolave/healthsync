import type { Agenda } from '../../domain';

/**
 * Outbound port (owned by the application layer) for reading and writing agenda data.
 * Implementations live in infrastructure — the domain and application layers
 * depend only on this interface (ADR-0002 hexagonal).
 */
export interface AgendaRepository {
  findAgendaForDate(doctorId: string, date: Date): Promise<Agenda | null>;
  saveAgenda(doctorId: string, date: Date, agenda: Agenda): Promise<void>;
}

/** DI token: the port is an interface so cannot be injected by type. */
export const AGENDA_REPOSITORY = Symbol('AGENDA_REPOSITORY');
