import type { TaskRepository } from "../ports/TaskRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { StatsRepository } from "../ports/StatsRepository";
import type { Task } from "../../domain/entities/Task";
import type { RoundState } from "../../domain/entities/RoundState";
import type { AppStats } from "../ports/StatsRepository";
import { bumpStats } from "./statsHelpers";

/** Maximum consecutive skips allowed without completing a task in between. */
const MAX_CONSECUTIVE_SKIPS = 1;

export interface SkipTaskOutput {
  task: Task;
  roundState: RoundState;
  stats: AppStats;
}

export class SkipTaskUseCase {
  constructor(
    private taskRepo: TaskRepository,
    private roundStateRepo: RoundStateRepository,
    private statsRepo: StatsRepository
  ) {}

  async execute(taskId: string): Promise<SkipTaskOutput> {
    const [tasks, roundState, stats] = await Promise.all([
      this.taskRepo.getAll(),
      this.roundStateRepo.get(),
      this.statsRepo.get(),
    ]);

    if (roundState.skipCardsLeft <= 0) {
      throw new Error("没有跳过卷了，完成任务可以获得更多跳过卷。");
    }

    if (roundState.consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
      throw new Error("需要先完成一个任务，才能再次使用跳过卷。");
    }

    const task = tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.skippedCount += 1;
    roundState.skipCardsLeft     -= 1;
    roundState.consecutiveSkips  += 1;
    roundState.activeTaskId       = null; // resolve active lock so next spin is unblocked

    if (!roundState.skippedTaskIdsThisRound.includes(taskId)) {
      roundState.skippedTaskIdsThisRound.push(taskId);
    }

    const updatedStats = bumpStats(stats, "skippedToday", "totalSkipped");

    await this.taskRepo.update(task);
    await this.statsRepo.save(updatedStats);
    await this.roundStateRepo.save(roundState);

    return { task, roundState, stats: updatedStats };
  }
}
