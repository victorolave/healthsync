/**
 * FE mirror of the scheduling service DTO types.
 * Keep in sync with: apps/scheduling/src/messages/dto/plan-response.dto.ts
 *
 * Canonical contract: times are 'HH:MM' strings (Java LocalTime.toString()).
 * Phase 2 froze this shape — if you update the backend DTO, update this file too.
 * Future improvement: extract to a shared-types package.
 */

/** Serialized time slot — 'HH:MM' strings */
export interface TimeSlotDto {
  start: string
  end: string
}

export interface OperationDto {
  type: 'move'
  appointmentId: string
  patientId: string
  from: TimeSlotDto
  to: TimeSlotDto
}

export type ConflictReason = 'OVERFLOWS_CLOSING'

export interface ConflictDto {
  appointmentId: string
  reason: ConflictReason
  proposedSlot: TimeSlotDto
}

/**
 * Response for POST /messages.
 * status is always 'proposed' in this phase — confirm flow is PR4 (FE-loop).
 */
export interface PlanResponseDto {
  status: 'proposed'
  operations: OperationDto[]
  conflicts: ConflictDto[]
  confidence: number
}

/* ------------------------------------------------------------------ */
/* Agenda DTOs — GET /agenda                                           */
/* ------------------------------------------------------------------ */

export interface AgendaAppointmentDto {
  id: string
  patientId: string
  slot: TimeSlotDto
}

export interface AgendaDto {
  date: string
  workingHours: {
    open: string
    close: string
  }
  appointments: AgendaAppointmentDto[]
}

/** Response for POST /messages/confirm */
export interface ConfirmResponseDto {
  status: 'applied'
  operations: OperationDto[]
  agenda: AgendaDto
}

/* ------------------------------------------------------------------ */
/* Discriminated Result<T> — API client return type                   */
/* ------------------------------------------------------------------ */

export type ApiError =
  | { kind: 'agenda_not_found'; message: string }
  | { kind: 'language_unavailable'; message: string }
  | { kind: 'service_unavailable'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'unknown'; message: string }

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }
