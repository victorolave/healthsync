import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { MessagesService } from './application/messages.service';
import { MessageDto } from './dto/message.dto';
import { ConfirmDto } from './dto/confirm.dto';
import type { PlanResponseDto } from './dto/plan-response.dto';
import type { ConfirmResponseDto } from './dto/confirm-response.dto';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @HttpCode(200)
  create(@Body() dto: MessageDto): Promise<PlanResponseDto> {
    return this.messagesService.process(dto);
  }

  @Post('confirm')
  @HttpCode(200)
  confirm(@Body() dto: ConfirmDto): Promise<ConfirmResponseDto> {
    return this.messagesService.confirm(dto.message);
  }
}
