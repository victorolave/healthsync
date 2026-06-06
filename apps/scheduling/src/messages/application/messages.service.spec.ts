import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { LanguagePort } from './language.port';
import { AgendaRepository } from './agenda.repository';
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

    if (parsed.operations.length > 0) {
      expect(typeof parsed.operations[0].from.start).toBe('string');
      expect(parsed.operations[0].from.start).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
