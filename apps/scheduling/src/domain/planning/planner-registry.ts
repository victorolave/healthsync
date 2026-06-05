import type { Planner } from './planner';

export type PlannerRegistry = ReadonlyMap<string, Planner>;

export function buildPlannerRegistry(): PlannerRegistry {
  // Skeleton — DelayPlanner will be wired in WU-11
  return new Map<string, Planner>();
}
