import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/messages.service';
import { LanguageClient } from './messages/language.client';

@Module({
  imports: [],
  controllers: [AppController, MessagesController],
  providers: [AppService, MessagesService, LanguageClient],
})
export class AppModule {}
