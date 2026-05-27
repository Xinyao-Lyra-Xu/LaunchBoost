import type { TaskCategory, TaskDifficulty } from "./domain/entities/Task";

export interface SplitTaskRequest {
  title: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  estimatedMinutes: number;
}

export interface SubtaskData {
  title: string;
  estimatedMinutes: number;
}

export interface PersistedTask {
  id: number;
  title: string;
  category: string;
  difficulty: string;
  estimatedMinutes: number;
  weight: number;
  repeatable: boolean;
  frequency: string;
  completed: boolean;
  completedCount: number;
  procrastinatedCount: number;
  skippedCount: number;
  activeInCurrentRound: boolean;
  parentTaskId?: string;
  timerMode?: string;
}

export interface PersistedReward {
  id: number;
  title: string;
  durationMinutes: number;
  weight: number;
  banked: number;
  active: boolean;
}

export interface PersistedMeta {
  skipCards?: {
    count: number;
    progress: number;
    consecutiveSkips: number;
    progressDate: string;
  };
  pendingSplitTaskId?: string | null;
  activeTaskId?: string | null;
  stats?: {
    todayKey?: string;
    completedToday?: number;
    procrastinatedToday?: number;
    skippedToday?: number;
    rewardsBankedToday?: number;
    totalCompleted?: number;
    totalProcrastinated?: number;
    totalSkipped?: number;
    totalRewardsBanked?: number;
  };
}

export interface PersistedData {
  tasks: PersistedTask[];
  rewards: PersistedReward[];
  meta: PersistedMeta;
}

declare global {
  interface Window {
    api: {
      loadData(): Promise<PersistedData>;
      saveData(data: PersistedData): Promise<boolean>;
      splitTask(input: SplitTaskRequest): Promise<
        | { subtasks: SubtaskData[]; error?: never }
        | { error: string; subtasks?: never }
      >;
    };
  }
}
