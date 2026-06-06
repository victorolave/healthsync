import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PlannerRegistry } from '../../domain';
import { recalculate } from '../../domain';
import { MessageDto } from '../dto/message.dto';
import type { PlanResponseDto } from '../dto/plan-response.dto';
import { mapPlanToDto } from '../dto/plan.mapper';
import { LANGUAGE_PORT } from './language.port';
import type { LanguagePort } from './language.port';
import { AGENDA_REPOSITORY } from './agenda.repository';
import type { AgendaRepository } from './agenda.repository';
import { PLANNER_REGISTRY } from './messages.tokens';
import { DOCTOR_ID, today } from './scheduling.constants';

@Injectable()
export class MessagesService {
  constructor(
    @Inject(LANGUAGE_PORT) private readonly language: LanguagePort,
    @Inject(AGENDA_REPOSITORY) private readonly agendaRepo: AgendaRepository,
    @Inject(PLANNER_REGISTRY) private readonly registry: PlannerRegistry,
  ) {}

  async process(dto: MessageDto): Promise<PlanResponseDto> {
    const { intent, confidence } = await this.language.interprets(dto.message);

    const ag = await this.agendaRepo.findAgendaForDate(DOCTOR_ID, today());
    if (!ag) {
      throw new UnprocessableEntityException({ error: 'agenda_not_found' });
    }

    const plan = recalculate(this.registry, ag, intent);

    return mapPlanToDto(plan, confidence);
  }
}
