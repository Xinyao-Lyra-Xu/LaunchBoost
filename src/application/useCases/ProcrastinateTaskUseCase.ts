import type { TaskRepository } from "../ports/TaskRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { StatsRepository } from "../ports/StatsRepository";
import type { Task } from "../../domain/entities/Task";
import type { RoundState } from "../../domain/entities/RoundState";
import type { AppStats } from "../ports/StatsRepository";
import { bumpStats } from "./statsHelpers";

export interface ProcrastinateTaskOutput {
  task: Task;
  roundState: RoundState;
  stats: AppStats;
}

export class ProcrastinateTaskUseCase {
  constructor(
    private taskRepo: TaskRepository,
    private roundStateRepo: RoundStateRepository,
    private statsRepo: StatsRepository
  ) {}

  async execute(taskId: string): Promise<ProcrastinateTaskOutput> {
    const [tasks, roundState, stats] = await Promise.all([
      this.taskRepo.getAll(),
      this.roundStateRepo.get(),
      this.statsRepo.get(),
    ]);

    const task = tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    task.procrastinatedCount += 1;
    roundState.procrastinationRecoveryMode = true;
    // Every procrastinated task must be split before the next spin.
    roundState.pendingSplitTaskId = taskId;

    const updatedStats = bumpStats(
      stats,
      "procrastinatedToday",
      "totalProcrastinated"
    );

    await this.taskRepo.update(task);
    await this.statsRepo.save(updatedStats);
    await this.roundStateRepo.save(roundState);

    return { task, roundState, stats: updatedStats };
  }
}
