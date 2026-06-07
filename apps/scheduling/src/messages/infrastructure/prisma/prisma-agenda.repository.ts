import { Injectable } from '@nestjs/common';
import type { Agenda } from '../../../domain';
import type { AgendaRepository } from '../../application/agenda.repository';
import { PrismaService } from './prisma.service';
import { toAgenda, fromLocalTime } from './agenda.mapper';

/**
 * Prisma-backed implementation of AgendaRepository.
 * Only this adapter (and agenda.mapper.ts) may import @prisma/client types.
 * Domain layer must remain free of @prisma/* (ADR-0002 hexagonal).
 */
@Injectable()
export class PrismaAgendaRepository implements AgendaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apply-on-confirm persistence: replace the day's appointments with the
   * post-recalculate set. Delete-then-insert inside one transaction so the
   * no_double_booking EXCLUDE constraint never sees a transient overlap. Working
   * hours are unchanged by a reschedule, so they are left as-is.
   */
  async saveAgenda(
    doctorId: string,
    date: Date,
    agenda: Agenda,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.appointment.deleteMany({ where: { doctorId, day: date } }),
      this.prisma.appointment.createMany({
        data: agenda.appointments.map((appt) => ({
          id: appt.id,
          doctorId,
          patientId: appt.patientId,
          day: date,
          startTime: fromLocalTime(appt.slot.start),
          endTime: fromLocalTime(appt.slot.end),
        })),
      }),
    ]);
  }

  async findAgendaForDate(
    doctorId: string,
    date: Date,
  ): Promise<Agenda | null> {
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
