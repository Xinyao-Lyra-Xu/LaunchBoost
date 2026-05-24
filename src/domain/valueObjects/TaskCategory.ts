export const TASK_CATEGORIES = ["study", "life", "health", "project"] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  study: "学习",
  life: "生活",
  health: "健康",
  project: "项目",
};

export function isTaskCategory(value: string): value is TaskCategory {
  return TASK_CATEGORIES.includes(value as TaskCategory);
}
