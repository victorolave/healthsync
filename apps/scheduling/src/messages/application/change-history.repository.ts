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
 * Phase 4 provides a real adapter; until then a fail-loud stub is wired (D5).
 */
export interface ChangeHistoryRepository {
  record(entry: ChangeHistoryEntry): Promise<void>;
}

/** DI token. */
export const CHANGE_HISTORY_REPOSITORY = Symbol('CHANGE_HISTORY_REPOSITORY');
