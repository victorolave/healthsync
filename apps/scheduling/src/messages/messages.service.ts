import { Injectable } from '@nestjs/common';
import { LanguageClient } from './language.client';
import { MessageDto } from './dto/message.dto';
import { IntentResponseDto } from './dto/intent-response.dto';

@Injectable()
export class MessagesService {
  constructor(private readonly languageClient: LanguageClient) {}

  async process(dto: MessageDto): Promise<IntentResponseDto> {
    return this.languageClient.interprets(dto.message);
  }
}
