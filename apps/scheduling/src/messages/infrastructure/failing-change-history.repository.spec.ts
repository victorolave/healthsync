import { FailingChangeHistoryRepository } from './failing-change-history.repository';
import type { ChangeHistoryEntry } from '../application/change-history.repository';

describe('FailingChangeHistoryRepository', () => {
  const entry: ChangeHistoryEntry = {
    doctorId: '00000000-0000-0000-0000-000000000001',
    occurredAt: new Date(),
    rawMessage: 'push my 3pm back 30 min',
    intentKind: 'DELAY',
    intentParams: { minutes: 30 },
    planSnapshot: {},
    applied: false,
  };

  it('throws referencing Phase 4 when record() is called', async () => {
    const repo = new FailingChangeHistoryRepository();
    await expect(repo.record(entry)).rejects.toThrow(
      /Phase 4/,
    );
  });

  it('satisfies the ChangeHistoryRepository port contract', () => {
    const repo = new FailingChangeHistoryRepository();
    expect(typeof repo.record).toBe('function');
  });
});
