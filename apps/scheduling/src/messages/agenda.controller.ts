import { Controller, Get } from '@nestjs/common';
import { MessagesService } from './application/messages.service';
import type { AgendaDto } from './dto/agenda.dto';

/**
 * Exposes GET /agenda — returns the current-day agenda for the hardcoded doctor.
 * Kept separate from MessagesController so the route path is exactly /agenda
 * (MessagesController prefix is 'messages').
 */
@Controller('agenda')
export class AgendaController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  getAgenda(): Promise<AgendaDto> {
    return this.messagesService.getAgenda();
  }
}
