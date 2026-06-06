/**
 * Hardcoded single-doctor ID for the MVP.
 * Phase 3+ will derive this from auth context.
 */
export const DOCTOR_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Returns the UTC-midnight Date for today.
 * Matches @db.Date in Postgres which stores dates without time.
 */
export function today(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
