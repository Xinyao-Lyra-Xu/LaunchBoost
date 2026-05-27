import type { Task } from "../../../domain/entities/Task";
import type { Reward } from "../../../domain/entities/Reward";
import type { RoundState } from "../../../domain/entities/RoundState";
import type { SpinResult } from "../../../domain/entities/SpinResult";
import type { AppStats } from "../../ports/StatsRepository";
import type { TaskRepository } from "../../ports/TaskRepository";
import type { RewardRepository } from "../../ports/RewardRepository";
import type { RoundStateRepository } from "../../ports/RoundStateRepository";
import type { SpinHistoryRepository } from "../../ports/SpinHistoryRepository";
import type { StatsRepository } from "../../ports/StatsRepository";
import type { TaskSplitterGateway, SplitTaskInput, SplitTaskOutput } from "../../ports/TaskSplitterGateway";

export function makeRoundState(overrides: Partial<RoundState> = {}): RoundState {
  return {
    completedTaskIdsThisRound: [],
    skippedTaskIdsThisRound: [],
    procrastinationRecoveryMode: false,
    skipCardsLeft: 2,
    skipCardProgress: 0,
    skipCardProgressDate: "",
    consecutiveSkips: 0,
    pendingSplitTaskId: null,
    activeTaskId: null,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Test task",
    category: "study",
    difficulty: "medium",
    estimatedMinutes: 30,
    baseWeight: 2,
    repeatable: true,
    frequency: "custom",
    completedCount: 0,
    procrastinatedCount: 0,
    skippedCount: 0,
    active: true,
    timerMode: "stopwatch",
    ...overrides,
  };
}

export function makeStats(overrides: Partial<AppStats> = {}): AppStats {
  return {
    completedToday: 0,
    procrastinatedToday: 0,
    skippedToday: 0,
    rewardsBankedToday: 0,
    totalCompleted: 0,
    totalProcrastinated: 0,
    totalSkipped: 0,
    totalRewardsBanked: 0,
    todayKey: "2026-5-25",
    ...overrides,
  };
}

// ── In-memory repositories ────────────────────────────────────────────────────

export class InMemoryTaskRepository implements TaskRepository {
  constructor(public tasks: Task[] = []) {}
  async getAll() { return [...this.tasks]; }
  async saveAll(tasks: Task[]) { this.tasks = [...tasks]; }
  async update(task: Task) {
    const idx = this.tasks.findIndex((t) => t.id === task.id);
    if (idx !== -1) this.tasks[idx] = { ...task };
    else this.tasks.push({ ...task });
  }
  async addMany(tasks: Task[]) { this.tasks.push(...tasks.map((t) => ({ ...t }))); }
}

export class InMemoryRoundStateRepository implements RoundStateRepository {
  constructor(public state: RoundState = makeRoundState()) {}
  async get() { return { ...this.state }; }
  async save(state: RoundState) { this.state = { ...state }; }
}

export class InMemoryStatsRepository implements StatsRepository {
  constructor(public stats: AppStats = makeStats()) {}
  async get() { return { ...this.stats }; }
  async save(stats: AppStats) { this.stats = { ...stats }; }
}

export class InMemoryRewardRepository implements RewardRepository {
  constructor(public rewards: Reward[] = []) {}
  async getAll() { return [...this.rewards]; }
  async saveAll(rewards: Reward[]) { this.rewards = [...rewards]; }
  async update(reward: Reward) {
    const idx = this.rewards.findIndex((r) => r.id === reward.id);
    if (idx !== -1) this.rewards[idx] = { ...reward };
    else this.rewards.push({ ...reward });
  }
}

export class InMemorySpinHistoryRepository implements SpinHistoryRepository {
  private history: SpinResult[] = [];
  async getAll() { return [...this.history]; }
  async add(result: SpinResult) { this.history.push(result); }
  async update(result: SpinResult) {
    const idx = this.history.findIndex((r) => r.id === result.id);
    if (idx !== -1) this.history[idx] = result;
  }
}

export class StubTaskSplitterGateway implements TaskSplitterGateway {
  constructor(private subtitles: string[] = ["子任务 A", "子任务 B"]) {}
  async splitTask(_input: SplitTaskInput): Promise<SplitTaskOutput> {
    return {
      subtasks: this.subtitles.map((title) => ({ title, estimatedMinutes: 15 })),
    };
  }
}

export class FailingTaskSplitterGateway implements TaskSplitterGateway {
  async splitTask(_input: SplitTaskInput): Promise<SplitTaskOutput> {
    throw new Error("AI service unavailable");
  }
}
