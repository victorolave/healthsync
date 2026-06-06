import { mapPlanToDto } from './plan.mapper';
import {
  localTime,
  timeSlot,
  appointment,
  planOf,
  emptyPlan,
} from '../../domain';

describe('mapPlanToDto', () => {
  const slot900_930 = timeSlot(localTime(9, 0), localTime(9, 30));
  const slot930_1000 = timeSlot(localTime(9, 30), localTime(10, 0));

  it('maps an empty plan to a PlanResponseDto with status proposed', () => {
    const dto = mapPlanToDto(emptyPlan(), 0.9);

    expect(dto.status).toBe('proposed');
    expect(dto.operations).toHaveLength(0);
    expect(dto.conflicts).toHaveLength(0);
    expect(dto.confidence).toBe(0.9);
  });

  it('maps move operations with HH:MM strings for from/to slots', () => {
    const appt = appointment('appt-1', 'patient-1', slot900_930);
    const plan = planOf(
      [{ type: 'move', appointmentId: appt.id, patientId: appt.patientId, from: slot900_930, to: slot930_1000 }],
      [],
    );

    const dto = mapPlanToDto(plan, 1.0);

    expect(dto.operations).toHaveLength(1);
    expect(dto.operations[0].from.start).toBe('09:00');
    expect(dto.operations[0].from.end).toBe('09:30');
    expect(dto.operations[0].to.start).toBe('09:30');
    expect(dto.operations[0].to.end).toBe('10:00');
  });

  it('CRITICAL: LocalTime serializes to HH:MM string (not empty object via JSON.stringify)', () => {
    // JSON.stringify does NOT call toString() on nested class instances.
    // This test verifies the mapper explicitly calls .toString().
    const appt = appointment('appt-1', 'patient-1', slot900_930);
    const plan = planOf(
      [{ type: 'move', appointmentId: appt.id, patientId: appt.patientId, from: slot900_930, to: slot930_1000 }],
      [],
    );

    const dto = mapPlanToDto(plan, 1.0);
    const json = JSON.stringify(dto);
    const parsed = JSON.parse(json);

    // If LocalTime.toString() was not called, these would be empty objects {}
    expect(typeof parsed.operations[0].from.start).toBe('string');
    expect(parsed.operations[0].from.start).toBe('09:00');
    expect(typeof parsed.operations[0].to.end).toBe('string');
    expect(parsed.operations[0].to.end).toBe('10:00');
  });

  it('maps conflict slots with HH:MM strings', () => {
    const plan = planOf(
      [],
      [{ appointmentId: 'appt-2', reason: 'OVERFLOWS_CLOSING', proposedSlot: slot930_1000 }],
    );

    const dto = mapPlanToDto(plan, 0.7);

    expect(dto.conflicts).toHaveLength(1);
    expect(dto.conflicts[0].proposedSlot.start).toBe('09:30');
    expect(dto.conflicts[0].proposedSlot.end).toBe('10:00');
    expect(dto.conflicts[0].reason).toBe('OVERFLOWS_CLOSING');
  });
});
