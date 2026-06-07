import {
  agenda,
  appointment,
  localTime,
  timeSlot,
  workingHours,
} from '../../domain';
import { DOCTOR_ID, today } from '../application/scheduling.constants';
import { InMemoryAgendaRepository } from './in-memory-agenda.repository';

/**
 * Demo seed (USE_IN_MEMORY_AGENDA=true): a today agenda for the hardcoded doctor
 * with working hours 09:00–17:00 and four afternoon appointments. A "llego 40
 * minutos tarde" DELAY shifts them all forward; the last one overflows closing
 * (17:00) so the demo also shows an OVERFLOWS_CLOSING conflict. No DB required.
 */
export function buildSeededInMemoryAgendaRepository(): InMemoryAgendaRepository {
  const repo = new InMemoryAgendaRepository();
  const wh = workingHours(localTime(9, 0), localTime(17, 0));
  const appts = [
    appointment('a1', 'María García', timeSlot(localTime(15, 0), localTime(15, 30))),
    appointment('a2', 'Juan Pérez', timeSlot(localTime(15, 30), localTime(16, 0))),
    appointment('a3', 'Ana López', timeSlot(localTime(16, 0), localTime(16, 30))),
    appointment('a4', 'Carlos Ruiz', timeSlot(localTime(16, 40), localTime(17, 0))),
  ];
  repo.seed(DOCTOR_ID, today(), agenda(appts, wh));
  return repo;
}
