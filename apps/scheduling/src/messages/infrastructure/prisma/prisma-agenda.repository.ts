import { Injectable } from '@nestjs/common';
import type { Agenda } from '../../../domain';
import type { AgendaRepository } from '../../application/agenda.repository';
import { PrismaService } from './prisma.service';
import { toAgenda } from './agenda.mapper';

/**
 * Prisma-backed implementation of AgendaRepository.
 * Only this adapter (and agenda.mapper.ts) may import @prisma/client types.
 * Domain layer must remain free of @prisma/* (ADR-0002 hexagonal).
 */
@Injectable()
export class PrismaAgendaRepository implements AgendaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAgendaForDate(doctorId: string, date: Date): Promise<Agenda | null> {
    const wh = await this.prisma.workingHours.findUnique({
      where: { doctorId_day: { doctorId, day: date } },
    });

    if (!wh) {
      return null;
    }

    const appointments = await this.prisma.appointment.findMany({
      where: { doctorId, day: date },
      orderBy: { startTime: 'asc' },
    });

    return toAgenda(wh, appointments);
  }
}
