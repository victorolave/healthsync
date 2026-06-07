import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagesController } from './messages/messages.controller';
import { AgendaController } from './messages/agenda.controller';
import { MessagesService } from './messages/application/messages.service';
import { LANGUAGE_PORT } from './messages/application/language.port';
import { HttpLanguageAdapter } from './messages/infrastructure/http-language.adapter';
import { AGENDA_REPOSITORY } from './messages/application/agenda.repository';
import { CHANGE_HISTORY_REPOSITORY } from './messages/application/change-history.repository';
import { PLANNER_REGISTRY } from './messages/application/messages.tokens';
import { PrismaService } from './messages/infrastructure/prisma/prisma.service';
import { PrismaAgendaRepository } from './messages/infrastructure/prisma/prisma-agenda.repository';
import { FailingChangeHistoryRepository } from './messages/infrastructure/failing-change-history.repository';
import { buildSeededInMemoryAgendaRepository } from './messages/infrastructure/demo-agenda.seed';
import { buildPlannerRegistry } from './domain';

@Module({
  imports: [],
  controllers: [AppController, MessagesController, AgendaController],
  providers: [
    AppService,
    MessagesService,
    PrismaService,
    { provide: LANGUAGE_PORT, useClass: HttpLanguageAdapter },
    {
      provide: AGENDA_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        process.env.USE_IN_MEMORY_AGENDA === 'true'
          ? buildSeededInMemoryAgendaRepository()
          : new PrismaAgendaRepository(prisma),
      inject: [PrismaService],
    },
    // Phase 4 architecture-in-waiting: the port + fail-loud stub are intentionally
    // registered here so DI fails loudly if any code attempts an accidental write.
    // MessagesService does NOT inject or call this repository in Phase 2 (read-only).
    // A real adapter will replace FailingChangeHistoryRepository when Phase 4 wires
    // apply-on-confirm and change_history persistence.
    {
      provide: CHANGE_HISTORY_REPOSITORY,
      useClass: FailingChangeHistoryRepository,
    },
    {
      provide: PLANNER_REGISTRY,
      useFactory: () => buildPlannerRegistry(),
    },
  ],
})
export class AppModule {}
