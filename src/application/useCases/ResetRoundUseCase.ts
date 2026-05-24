import type { TaskRepository } from "../ports/TaskRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { Task } from "../../domain/entities/Task";
import type { RoundState } from "../../domain/entities/RoundState";

export interface ResetRoundOutput {
  tasks: Task[];
  roundState: RoundState;
}

export class ResetRoundUseCase {
  constructor(
    private taskRepo: TaskRepository,
    private roundStateRepo: RoundStateRepository
  ) {}

  async execute(): Promise<ResetRoundOutput> {
    const [tasks, roundState] = await Promise.all([
      this.taskRepo.getAll(),
      this.roundStateRepo.get(),
    ]);

    // Re-activate repeatable tasks
    tasks.forEach((t) => {
      if (t.repeatable && t.frequency !== "once") {
        t.active = true;
      }
    });

    roundState.completedTaskIdsThisRound = [];
    roundState.skippedTaskIdsThisRound = [];
    roundState.procrastinationRecoveryMode = false;

    await Promise.all([
      this.taskRepo.saveAll(tasks),
      this.roundStateRepo.save(roundState),
    ]);

    return { tasks, roundState };
  }
}
