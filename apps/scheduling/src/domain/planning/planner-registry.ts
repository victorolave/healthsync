import { DelayPlanner } from './delay-planner';
import type { Planner } from './planner';

export type PlannerRegistry = ReadonlyMap<string, Planner>;

export function buildPlannerRegistry(): PlannerRegistry {
  return new Map<string, Planner>([['DELAY', new DelayPlanner()]]);
}
