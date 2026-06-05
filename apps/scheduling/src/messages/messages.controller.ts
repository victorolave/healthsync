import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { MessagesService } from './application/messages.service';
import { MessageDto } from './dto/message.dto';
import { IntentResponseDto } from './dto/intent-response.dto';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @HttpCode(200)
  create(@Body() dto: MessageDto): Promise<IntentResponseDto> {
    return this.messagesService.process(dto);
  }
}
