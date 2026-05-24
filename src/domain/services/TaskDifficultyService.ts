import type { TaskDifficulty } from "../valueObjects/TaskDifficulty";
import { PROCRASTINATION_MULTIPLIERS } from "../valueObjects/TaskDifficulty";
import type { Task } from "../entities/Task";

/**
 * Returns the effective probability weight for a task.
 * In procrastination recovery mode, easy tasks get a higher multiplier
 * and hard tasks get a lower one.
 */
export function getEffectiveWeight(
  task: Task,
  procrastinationRecoveryMode: boolean
): number {
  const base = task.baseWeight;
  if (!procrastinationRecoveryMode) return base;
  const multiplier =
    PROCRASTINATION_MULTIPLIERS[task.difficulty as TaskDifficulty] ?? 1;
  return base * multiplier;
}
