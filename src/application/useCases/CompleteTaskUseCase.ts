import type { TaskRepository } from "../ports/TaskRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { StatsRepository } from "../ports/StatsRepository";
import type { Task } from "../../domain/entities/Task";
import type { RoundState } from "../../domain/entities/RoundState";
import type { AppStats } from "../ports/StatsRepository";
import { bumpStats } from "./statsHelpers";

export interface CompleteTaskOutput {
  task: Task;
  roundState: RoundState;
  stats: AppStats;
}

export class CompleteTaskUseCase {
  constructor(
    private taskRepo: TaskRepository,
    private roundStateRepo: RoundStateRepository,
    private statsRepo: StatsRepository
  ) {}

  async execute(taskId: string): Promise<CompleteTaskOutput> {
    const [tasks, roundState, stats] = await Promise.all([
      this.taskRepo.getAll(),
      this.roundStateRepo.get(),
      this.statsRepo.get(),
    ]);

    const task = tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.completedCount += 1;
    if (!task.repeatable) {
      task.active = false;
    }

    if (!roundState.completedTaskIdsThisRound.includes(taskId)) {
      roundState.completedTaskIdsThisRound.push(taskId);
    }

    const updatedStats = bumpStats(stats, "completedToday", "totalCompleted");

    await Promise.all([
      this.taskRepo.update(task),
      this.roundStateRepo.save(roundState),
      this.statsRepo.save(updatedStats),
    ]);

    return { task, roundState, stats: updatedStats };
  }
}
