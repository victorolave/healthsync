import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/messages/infrastructure/prisma/prisma.service';
import { AGENDA_REPOSITORY } from '../src/messages/application/agenda.repository';
import { InMemoryAgendaRepository } from '../src/messages/infrastructure/in-memory-agenda.repository';
import { LANGUAGE_PORT } from '../src/messages/application/language.port';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(AGENDA_REPOSITORY)
      .useValue(new InMemoryAgendaRepository())
      .overrideProvider(LANGUAGE_PORT)
      .useValue({ interprets: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
