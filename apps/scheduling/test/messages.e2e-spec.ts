import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import {
  LANGUAGE_PORT,
  LanguagePort,
} from '../src/messages/application/language.port';

describe('POST /messages (e2e)', () => {
  let app: INestApplication;
  let language: jest.Mocked<LanguagePort>;

  const mockIntentResponse = {
    intent: { kind: 'DELAY', params: { minutes: 15 } },
    confidence: 1.0,
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LANGUAGE_PORT)
      .useValue({
        interprets: jest.fn().mockResolvedValue(mockIntentResponse),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    language = moduleFixture.get<jest.Mocked<LanguagePort>>(LANGUAGE_PORT);
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /messages → 200 with DELAY intent body', () => {
    return request(app.getHttpServer())
      .post('/messages')
      .send({ message: 'push my 3pm back 30 min' })
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(mockIntentResponse);
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
