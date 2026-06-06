import type { Agenda } from '../agenda/agenda';
import type { Intent } from '../intent/intent';
import type { Plan } from '../plan/plan';

export interface Planner {
  plan(agenda: Agenda, intent: Intent): Plan;
}
