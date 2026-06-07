import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PlannerRegistry } from '../../domain';
import { recalculate, agenda, withSlot, UnsupportedIntentError } from '../../domain';
import type { MovePlanOperation } from '../../domain';
import { MessageDto } from '../dto/message.dto';
import type { PlanResponseDto } from '../dto/plan-response.dto';
import { mapPlanToDto } from '../dto/plan.mapper';
import type { AgendaDto } from '../dto/agenda.dto';
import { agendaToDto } from '../dto/agenda.mapper';
import type { ConfirmResponseDto } from '../dto/confirm-response.dto';
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

    try {
      const plan = recalculate(this.registry, ag, intent);
      return mapPlanToDto(plan, confidence);
    } catch (err) {
      if (err instanceof UnsupportedIntentError) {
        throw new UnprocessableEntityException({ error: 'unsupported_intent' });
      }
      throw err;
    }
  }

  async getAgenda(): Promise<AgendaDto> {
    const date = today();
    const ag = await this.agendaRepo.findAgendaForDate(DOCTOR_ID, date);
    if (!ag) {
      throw new UnprocessableEntityException({ error: 'agenda_not_found' });
    }
    return agendaToDto(ag, date);
  }

  async confirm(message: string): Promise<ConfirmResponseDto> {
    const { intent } = await this.language.interprets(message);

    const date = today();
    const ag = await this.agendaRepo.findAgendaForDate(DOCTOR_ID, date);
    if (!ag) {
      throw new UnprocessableEntityException({ error: 'agenda_not_found' });
    }

    let plan;
    try {
      plan = recalculate(this.registry, ag, intent);
    } catch (err) {
      if (err instanceof UnsupportedIntentError) {
        throw new UnprocessableEntityException({ error: 'unsupported_intent' });
      }
      throw err;
    }

    // Build a lookup of appointmentId → target TimeSlot from the move operations
    const moveMap = new Map<string, MovePlanOperation>(
      plan.operations
        .filter((op): op is MovePlanOperation => op.type === 'move')
        .map((op) => [op.appointmentId, op]),
    );

    // Apply moves: replace slot for each appointment that has a move operation
    const movedAppointments = ag.appointments.map((appt) => {
      const op = moveMap.get(appt.id);
      return op ? withSlot(appt, op.to) : appt;
    });

    const newAgenda = agenda([...movedAppointments], ag.workingHours);
    await this.agendaRepo.saveAgenda(DOCTOR_ID, date, newAgenda);

    return {
      status: 'applied',
      operations: mapPlanToDto(plan, 1).operations,
      agenda: agendaToDto(newAgenda, date),
    };
  }
}
