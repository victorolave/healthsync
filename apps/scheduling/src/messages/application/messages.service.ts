import { Inject, Injectable } from '@nestjs/common';
import { MessageDto } from '../dto/message.dto';
import { IntentResponseDto } from '../dto/intent-response.dto';
import { LANGUAGE_PORT } from './language.port';
import type { LanguagePort } from './language.port';

@Injectable()
export class MessagesService {
  constructor(
    @Inject(LANGUAGE_PORT) private readonly language: LanguagePort,
  ) {}

  async process(dto: MessageDto): Promise<IntentResponseDto> {
    return this.language.interprets(dto.message);
  }
}
