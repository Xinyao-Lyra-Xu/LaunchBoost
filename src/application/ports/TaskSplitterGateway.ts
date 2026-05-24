import type { TaskCategory } from "../../domain/valueObjects/TaskCategory";
import type { TaskDifficulty } from "../../domain/valueObjects/TaskDifficulty";

export interface SplitTaskInput {
  title: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  estimatedMinutes: number;
}

export interface SubtaskData {
  title: string;
  estimatedMinutes: number;
}

export interface SplitTaskOutput {
  subtasks: SubtaskData[];
}

export interface TaskSplitterGateway {
  splitTask(input: SplitTaskInput): Promise<SplitTaskOutput>;
}
