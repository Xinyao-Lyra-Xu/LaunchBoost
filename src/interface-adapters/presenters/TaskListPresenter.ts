import type { Task } from "../../domain/entities/Task";
import type { RoundState } from "../../domain/entities/RoundState";
import { CATEGORY_LABELS } from "../../domain/valueObjects/TaskCategory";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
} from "../../domain/valueObjects/TaskDifficulty";

const TASK_COLORS = [
  "#60A5FA", "#34D399", "#A78BFA", "#F472B6",
  "#38BDF8", "#4ADE80", "#C084FC", "#FB923C",
  "#2DD4BF", "#E879F9",
];

export interface TaskListItem {
  id: string;
  title: string;
  categoryLabel: string;
  difficultyLabel: string;
  difficultyColor: string;
  estimatedMinutes: number;
  dotColor: string;
  isCompleted: boolean;
  isInactive: boolean;
  isOneTime: boolean;
}

export function toTaskListItems(
  tasks: Task[],
  roundState: RoundState
): TaskListItem[] {
  return tasks.map((t, i) => {
    const isCompleted = roundState.completedTaskIdsThisRound.includes(t.id);
    const isSkipped = roundState.skippedTaskIdsThisRound.includes(t.id);
    const isInactive = !t.active && !isCompleted;
    return {
      id: t.id,
      title: t.title,
      categoryLabel: CATEGORY_LABELS[t.category] ?? t.category,
      difficultyLabel: DIFFICULTY_LABELS[t.difficulty] ?? t.difficulty,
      difficultyColor: DIFFICULTY_COLORS[t.difficulty] ?? "#8b8fa8",
      estimatedMinutes: t.estimatedMinutes,
      dotColor: TASK_COLORS[i % TASK_COLORS.length],
      isCompleted,
      isInactive: isInactive || isSkipped,
      isOneTime: !t.repeatable || t.frequency === "once",
    };
  });
}
