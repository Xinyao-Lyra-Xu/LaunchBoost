export type TaskCategory = "study" | "life" | "health" | "project";
export type TaskDifficulty = "easy" | "medium" | "hard";
export type TaskFrequency = "daily" | "weekly" | "custom" | "once";

export interface Task {
  id: string;
  title: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  estimatedMinutes: number;
  /** Base probability weight before difficulty adjustments. */
  baseWeight: number;
  repeatable: boolean;
  frequency: TaskFrequency;
  completedCount: number;
  procrastinatedCount: number;
  skippedCount: number;
  /** False means the task has been permanently retired (non-repeatable, completed). */
  active: boolean;
}
