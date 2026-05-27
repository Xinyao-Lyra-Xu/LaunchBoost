import type { TaskRepository } from "../ports/TaskRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { StatsRepository } from "../ports/StatsRepository";
import type { Task } from "../../domain/entities/Task";
import type { RoundState } from "../../domain/entities/RoundState";
import type { AppStats } from "../ports/StatsRepository";
import { bumpStats, getTodayKey } from "./statsHelpers";

/** How many task completions are needed to earn one skip card. */
const TASKS_PER_CARD = 3;
/** Maximum skip cards a user can hold at once. */
const SKIP_CARD_MAX = 3;

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

    // Clear the active task lock so the next spin is unblocked.
    roundState.activeTaskId = null;

    // ── Skip-card progress ───────────────────────────────────────────────────
    // Only earn progress while below the cap (no overflow accumulation).
    if (roundState.skipCardsLeft < SKIP_CARD_MAX) {
      const today = getTodayKey();
      let gain = 1;
      // First completion of each calendar day grants a bonus progress point.
      if (roundState.skipCardProgressDate !== today) {
        gain += 1;
        roundState.skipCardProgressDate = today;
      }
      roundState.skipCardProgress += gain;

      if (roundState.skipCardProgress >= TASKS_PER_CARD) {
        roundState.skipCardsLeft = Math.min(roundState.skipCardsLeft + 1, SKIP_CARD_MAX);
        roundState.skipCardProgress -= TASKS_PER_CARD; // carry over surplus
      }
    }

    // Completing a task clears the consecutive-skip restriction.
    roundState.consecutiveSkips = 0;

    const updatedStats = bumpStats(stats, "completedToday", "totalCompleted");

    await this.taskRepo.update(task);
    await this.statsRepo.save(updatedStats);
    await this.roundStateRepo.save(roundState);

    return { task, roundState, stats: updatedStats };
  }
}
