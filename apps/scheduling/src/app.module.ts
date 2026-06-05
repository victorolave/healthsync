import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/application/messages.service';
import { LANGUAGE_PORT } from './messages/application/language.port';
import { HttpLanguageAdapter } from './messages/infrastructure/http-language.adapter';

@Module({
  imports: [],
  controllers: [AppController, MessagesController],
  providers: [
    AppService,
    MessagesService,
    { provide: LANGUAGE_PORT, useClass: HttpLanguageAdapter },
  ],
})
export class AppModule {}
