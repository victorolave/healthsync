import { Injectable } from '@nestjs/common';
import type {
  ChangeHistoryRepository,
  ChangeHistoryEntry,
} from '../application/change-history.repository';

/**
 * Fail-loud stub for ChangeHistoryRepository.
 * Phase 4 will replace this with a real Prisma adapter.
 * Throws if record() is called so we never silently swallow writes (D5).
 */
@Injectable()
export class FailingChangeHistoryRepository implements ChangeHistoryRepository {
  async record(_entry: ChangeHistoryEntry): Promise<void> {
    throw new Error(
      'ChangeHistoryRepository: writes not implemented yet — coming in Phase 4',
    );
  }
}
