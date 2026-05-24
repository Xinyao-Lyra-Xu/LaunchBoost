export const TASK_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type TaskDifficulty = (typeof TASK_DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<TaskDifficulty, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

export const DIFFICULTY_COLORS: Record<TaskDifficulty, string> = {
  easy: "#34d399",
  medium: "#fbbf24",
  hard: "#f87171",
};

/** Weight multipliers applied when procrastinationRecoveryMode is active. */
export const PROCRASTINATION_MULTIPLIERS: Record<TaskDifficulty, number> = {
  easy: 2,
  medium: 1.2,
  hard: 0.7,
};

export function isTaskDifficulty(value: string): value is TaskDifficulty {
  return TASK_DIFFICULTIES.includes(value as TaskDifficulty);
}
