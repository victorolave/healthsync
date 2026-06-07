import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { LanguagePort } from './language.port';
import { MessageDto } from '../dto/message.dto';
import { InMemoryAgendaRepository } from '../infrastructure/in-memory-agenda.repository';
import {
  agenda,
  workingHours,
  localTime,
  appointment,
  timeSlot,
  buildPlannerRegistry,
} from '../../domain';
import { DOCTOR_ID, today } from './scheduling.constants';

describe('MessagesService', () => {
  let service: MessagesService;
  let language: jest.Mocked<LanguagePort>;
  let agendaRepo: InMemoryAgendaRepository;
  const registry = buildPlannerRegistry();

  const mockIntentResponse = {
    intent: { kind: 'DELAY', params: { minutes: 15 } },
    confidence: 1.0,
  };

  const TODAY = today();

  const makeAgenda = () => {
    const wh = workingHours(localTime(8, 0), localTime(17, 0));
    const appt = appointment(
      'appt-1',
      'patient-1',
      timeSlot(localTime(9, 0), localTime(9, 30)),
    );
    return agenda([appt], wh);
  };

  beforeEach(() => {
    language = { interprets: jest.fn() };
    agendaRepo = new InMemoryAgendaRepository();
    service = new MessagesService(language, agendaRepo, registry);
  });

  it('returns a PlanResponseDto with status proposed when agenda exists', async () => {
    language.interprets.mockResolvedValueOnce(mockIntentResponse);
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());

    const dto: MessageDto = { message: 'push my 3pm back 30 min' };
    const result = await service.process(dto);

    expect(result.status).toBe('proposed');
    expect(result.confidence).toBe(1.0);
    expect(Array.isArray(result.operations)).toBe(true);
    expect(Array.isArray(result.conflicts)).toBe(true);
  });

  it('throws 422 UnprocessableEntityException when agenda not found', async () => {
    language.interprets.mockResolvedValueOnce(mockIntentResponse);
    // Do NOT seed agendaRepo — simulates no working_hours row

    const dto: MessageDto = { message: 'delay my 3pm' };
    await expect(service.process(dto)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('throws 422 with agenda_not_found error body', async () => {
    language.interprets.mockResolvedValueOnce(mockIntentResponse);

    const dto: MessageDto = { message: 'delay my 3pm' };
    try {
      await service.process(dto);
      fail('Expected UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const body = (err as UnprocessableEntityException).getResponse() as { error: string };
      expect(body.error).toBe('agenda_not_found');
    }
  });

  it('re-throws ServiceUnavailableException when the language port throws', async () => {
    language.interprets.mockRejectedValueOnce(
      new ServiceUnavailableException({ error: 'language_unavailable' }),
    );

    const dto: MessageDto = { message: 'test' };
    await expect(service.process(dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('returns HH:MM strings for time slots (LocalTime serialization gotcha)', async () => {
    language.interprets.mockResolvedValueOnce(mockIntentResponse);
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());

    const dto: MessageDto = { message: 'push my 3pm back 15 min' };
    const result = await service.process(dto);

    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);

    expect(parsed.operations.length).toBeGreaterThan(0);
    expect(typeof parsed.operations[0].from.start).toBe('string');
    expect(parsed.operations[0].from.start).toMatch(/^\d{2}:\d{2}$/);
  });

  it('throws 422 unsupported_intent when process receives an unknown intent kind', async () => {
    language.interprets.mockResolvedValueOnce({
      intent: { kind: 'UNKNOWN_INTENT_XYZ', params: {} },
      confidence: 0.9,
    });
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());

    const dto: MessageDto = { message: 'do something weird' };
    try {
      await service.process(dto);
      fail('Expected UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const body = (err as UnprocessableEntityException).getResponse() as { error: string };
      expect(body.error).toBe('unsupported_intent');
    }
  });
});

describe('MessagesService.getAgenda', () => {
  let service: MessagesService;
  let language: jest.Mocked<LanguagePort>;
  let agendaRepo: InMemoryAgendaRepository;
  const registry = buildPlannerRegistry();

  const TODAY = today();

  const makeAgenda = () => {
    const wh = workingHours(localTime(8, 0), localTime(17, 0));
    const appt = appointment(
      'appt-1',
      'patient-1',
      timeSlot(localTime(9, 0), localTime(9, 30)),
    );
    return agenda([appt], wh);
  };

  beforeEach(() => {
    language = { interprets: jest.fn() };
    agendaRepo = new InMemoryAgendaRepository();
    service = new MessagesService(language, agendaRepo, registry);
  });

  it('returns an AgendaDto when the agenda is seeded', async () => {
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());

    const result = await service.getAgenda();

    expect(result.workingHours.open).toBe('08:00');
    expect(result.workingHours.close).toBe('17:00');
    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0].id).toBe('appt-1');
    expect(result.appointments[0].slot.start).toBe('09:00');
    expect(result.appointments[0].slot.end).toBe('09:30');
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('throws 422 agenda_not_found when agenda is not seeded', async () => {
    try {
      await service.getAgenda();
      fail('Expected UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const body = (err as UnprocessableEntityException).getResponse() as { error: string };
      expect(body.error).toBe('agenda_not_found');
    }
  });
});

describe('MessagesService.confirm', () => {
  let service: MessagesService;
  let language: jest.Mocked<LanguagePort>;
  let agendaRepo: InMemoryAgendaRepository;
  const registry = buildPlannerRegistry();

  const TODAY = today();

  const makeAgenda = () => {
    const wh = workingHours(localTime(8, 0), localTime(17, 0));
    const appt = appointment(
      'appt-1',
      'patient-1',
      timeSlot(localTime(9, 0), localTime(9, 30)),
    );
    return agenda([appt], wh);
  };

  beforeEach(() => {
    language = { interprets: jest.fn() };
    agendaRepo = new InMemoryAgendaRepository();
    service = new MessagesService(language, agendaRepo, registry);
  });

  it('returns applied status with operations and shifted agenda', async () => {
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());
    language.interprets.mockResolvedValueOnce({
      intent: { kind: 'DELAY', params: { minutes: 40 } },
      confidence: 1.0,
    });

    const result = await service.confirm('delay everything by 40 minutes');

    expect(result.status).toBe('applied');
    expect(Array.isArray(result.operations)).toBe(true);
    expect(result.operations.length).toBeGreaterThan(0);
    expect(result.agenda.appointments).toHaveLength(1);
  });

  it('persists the shifted agenda to the repository after confirm', async () => {
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());
    language.interprets.mockResolvedValueOnce({
      intent: { kind: 'DELAY', params: { minutes: 40 } },
      confidence: 1.0,
    });

    await service.confirm('delay everything by 40 minutes');

    const saved = await agendaRepo.findAgendaForDate(DOCTOR_ID, TODAY);
    expect(saved).not.toBeNull();
    // appt-1 was 09:00–09:30, delayed 40 min → 09:40–10:10
    expect(saved!.appointments[0].slot.start.toString()).toBe('09:40');
    expect(saved!.appointments[0].slot.end.toString()).toBe('10:10');
  });

  it('returns agenda DTO with HH:MM strings after confirm', async () => {
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());
    language.interprets.mockResolvedValueOnce({
      intent: { kind: 'DELAY', params: { minutes: 40 } },
      confidence: 1.0,
    });

    const result = await service.confirm('delay everything by 40 minutes');

    expect(result.agenda.appointments[0].slot.start).toBe('09:40');
    expect(result.agenda.appointments[0].slot.end).toBe('10:10');
  });

  it('throws 422 agenda_not_found when no agenda exists', async () => {
    language.interprets.mockResolvedValueOnce({
      intent: { kind: 'DELAY', params: { minutes: 10 } },
      confidence: 1.0,
    });

    try {
      await service.confirm('delay');
      fail('Expected UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const body = (err as UnprocessableEntityException).getResponse() as { error: string };
      expect(body.error).toBe('agenda_not_found');
    }
  });

  it('throws 422 unsupported_intent when confirm receives an unknown intent kind', async () => {
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());
    language.interprets.mockResolvedValueOnce({
      intent: { kind: 'TELEPORT', params: {} },
      confidence: 0.5,
    });

    try {
      await service.confirm('teleport appointments');
      fail('Expected UnprocessableEntityException');
    } catch (err) {
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      const body = (err as UnprocessableEntityException).getResponse() as { error: string };
      expect(body.error).toBe('unsupported_intent');
    }
  });
});
