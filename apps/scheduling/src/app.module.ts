import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/application/messages.service';
import { LANGUAGE_PORT } from './messages/application/language.port';
import { HttpLanguageAdapter } from './messages/infrastructure/http-language.adapter';
import { AGENDA_REPOSITORY } from './messages/application/agenda.repository';
import { CHANGE_HISTORY_REPOSITORY } from './messages/application/change-history.repository';
import { PLANNER_REGISTRY } from './messages/application/messages.tokens';
import { PrismaService } from './messages/infrastructure/prisma/prisma.service';
import { PrismaAgendaRepository } from './messages/infrastructure/prisma/prisma-agenda.repository';
import { FailingChangeHistoryRepository } from './messages/infrastructure/failing-change-history.repository';
import { buildPlannerRegistry } from './domain';

@Module({
  imports: [],
  controllers: [AppController, MessagesController],
  providers: [
    AppService,
    MessagesService,
    PrismaService,
    { provide: LANGUAGE_PORT, useClass: HttpLanguageAdapter },
    { provide: AGENDA_REPOSITORY, useClass: PrismaAgendaRepository },
    { provide: CHANGE_HISTORY_REPOSITORY, useClass: FailingChangeHistoryRepository },
    {
      provide: PLANNER_REGISTRY,
      useFactory: () => buildPlannerRegistry(),
    },
  ],
})
export class AppModule {}
