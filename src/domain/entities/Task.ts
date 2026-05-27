export type TaskCategory = "study" | "life" | "health" | "project";
export type TaskDifficulty = "easy" | "medium" | "hard";
export type TaskFrequency = "daily" | "weekly" | "custom" | "once";
export type TimerMode = "stopwatch" | "countdown";

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
  /** Set when this task was created by splitting a parent task. References the parent's id. */
  parentTaskId?: string;
  /** How time is tracked during task execution. Defaults to "stopwatch". */
  timerMode: TimerMode;
}
