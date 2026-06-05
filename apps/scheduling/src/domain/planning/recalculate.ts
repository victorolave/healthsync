import type { Agenda } from '../agenda/agenda';
import type { Intent } from '../intent/intent';
import { UnsupportedIntentError } from '../intent/unsupported-intent.error';
import type { Plan } from '../plan/plan';
import type { PlannerRegistry } from './planner-registry';

export function recalculate(
  registry: PlannerRegistry,
  agenda: Agenda,
  intent: Intent,
): Plan {
  const planner = registry.get(intent.kind);
  if (!planner) {
    throw new UnsupportedIntentError(intent.kind);
  }
  return planner.plan(agenda, intent);
}
