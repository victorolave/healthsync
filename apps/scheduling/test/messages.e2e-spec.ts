import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import {
  LANGUAGE_PORT,
  LanguagePort,
} from '../src/messages/application/language.port';
import { AGENDA_REPOSITORY } from '../src/messages/application/agenda.repository';
import { InMemoryAgendaRepository } from '../src/messages/infrastructure/in-memory-agenda.repository';
import {
  agenda,
  workingHours,
  localTime,
  appointment,
  timeSlot,
} from '../src/domain';
import { DOCTOR_ID, today } from '../src/messages/application/scheduling.constants';
import { PrismaService } from '../src/messages/infrastructure/prisma/prisma.service';

describe('POST /messages (e2e)', () => {
  let app: INestApplication;
  let language: jest.Mocked<LanguagePort>;
  let agendaRepo: InMemoryAgendaRepository;

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

  beforeEach(async () => {
    agendaRepo = new InMemoryAgendaRepository();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LANGUAGE_PORT)
      .useValue({
        interprets: jest.fn().mockResolvedValue(mockIntentResponse),
      })
      .overrideProvider(AGENDA_REPOSITORY)
      .useValue(agendaRepo)
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    language = moduleFixture.get<jest.Mocked<LanguagePort>>(LANGUAGE_PORT);
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /messages → 200 with PlanResponseDto (status: proposed)', () => {
    agendaRepo.seed(DOCTOR_ID, TODAY, makeAgenda());

    return request(app.getHttpServer())
      .post('/messages')
      .send({ message: 'push my 3pm back 15 min' })
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('proposed');
        expect(typeof res.body.confidence).toBe('number');
        expect(Array.isArray(res.body.operations)).toBe(true);
        expect(Array.isArray(res.body.conflicts)).toBe(true);
      });
  });

  it('POST /messages → 422 when agenda not found (no seed)', () => {
    // No seed in agendaRepo → findAgendaForDate returns null → 422
    return request(app.getHttpServer())
      .post('/messages')
      .send({ message: 'push my 3pm back 15 min' })
      .expect(422)
      .expect((res) => {
        expect(res.body).toMatchObject({ error: 'agenda_not_found' });
      });
  });

  it('POST /messages → 400 when message is empty', () => {
    return request(app.getHttpServer())
      .post('/messages')
      .send({ message: '' })
      .expect(400);
  });

  it('POST /messages → 400 when message is missing', () => {
    return request(app.getHttpServer()).post('/messages').send({}).expect(400);
  });

  it('POST /messages → 503 { error: language_unavailable } when language throws', () => {
    (language.interprets as jest.Mock).mockRejectedValueOnce(
      new ServiceUnavailableException({ error: 'language_unavailable' }),
    );

    return request(app.getHttpServer())
      .post('/messages')
      .send({ message: 'test' })
      .expect(503)
      .expect((res) => {
        expect(res.body).toMatchObject({ error: 'language_unavailable' });
      });
  });

  it('OPTIONS /messages preflight → CORS headers present', () => {
    return request(app.getHttpServer())
      .options('/messages')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect((res) => {
        expect(res.headers['access-control-allow-origin']).toBe(
          'http://localhost:5173',
        );
        expect([200, 204]).toContain(res.status);
      });
  });
});
