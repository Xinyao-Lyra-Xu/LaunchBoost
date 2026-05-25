import type { TaskRepository } from "../ports/TaskRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { StatsRepository } from "../ports/StatsRepository";
import type { Task } from "../../domain/entities/Task";
import type { RoundState } from "../../domain/entities/RoundState";
import type { AppStats } from "../ports/StatsRepository";
import { bumpStats } from "./statsHelpers";

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
      throw new Error("No skip cards left.");
    }

    const task = tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.skippedCount += 1;
    roundState.skipCardsLeft -= 1;

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
