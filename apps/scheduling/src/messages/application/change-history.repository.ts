/**
 * Entry shape for recording an interpreted+planned operation in the audit log.
 * Writes are deferred to Phase 4; this port exists so the composition root can
 * wire a fail-loud stub and keep the architecture honest (ADR-0002).
 */
export interface ChangeHistoryEntry {
  doctorId: string;
  occurredAt: Date;
  rawMessage: string;
  intentKind: string;
  intentParams: Record<string, unknown>;
  planSnapshot: unknown;
  applied: boolean;
}

/**
 * Outbound port for persisting change-history records.
 *
 * Phase 4 architecture-in-waiting: this port and the FailingChangeHistoryRepository
 * stub are laid down in Phase 2 to keep the hexagonal architecture honest (ADR-0002,
 * D5). They are intentionally NOT consumed by MessagesService in Phase 2 — this phase
 * is read-only on persistence (interpret → load Agenda → plan → return DTO).
 *
 * Phase 4 will wire apply-on-confirm and replace the stub with a real Prisma adapter.
 * Until then, any premature call to record() will throw, surfacing the violation loudly.
 */
export interface ChangeHistoryRepository {
  record(entry: ChangeHistoryEntry): Promise<void>;
}

/** DI token. */
export const CHANGE_HISTORY_REPOSITORY = Symbol('CHANGE_HISTORY_REPOSITORY');
