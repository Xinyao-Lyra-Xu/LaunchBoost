import type { TaskRepository } from "../ports/TaskRepository";
import type { RewardRepository } from "../ports/RewardRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { SpinHistoryRepository } from "../ports/SpinHistoryRepository";
import {
  calculateWheelItems,
  pickWinner,
  type WheelItem,
} from "../../domain/services/SpinnerProbabilityService";

export interface SpinWheelOutput {
  winner: WheelItem;
  wheelItems: WheelItem[];
}

export class SpinWheelUseCase {
  constructor(
    private taskRepo: TaskRepository,
    private rewardRepo: RewardRepository,
    private roundStateRepo: RoundStateRepository,
    private spinHistoryRepo: SpinHistoryRepository
  ) {}

  async execute(): Promise<SpinWheelOutput> {
    const [tasks, rewards, roundState] = await Promise.all([
      this.taskRepo.getAll(),
      this.rewardRepo.getAll(),
      this.roundStateRepo.get(),
    ]);

    // Block spin while the current active task has not been resolved.
    if (roundState.activeTaskId !== null) {
      throw new Error("请先完成当前任务后再转动。");
    }

    // Block spin while a task is awaiting mandatory split.
    if (roundState.pendingSplitTaskId) {
      throw new Error("请先完成任务拆解后再转动。");
    }

    // Block spin while any subtask from a previous split is still active.
    const pendingSubtasks = tasks.filter(
      (t) => t.active && t.parentTaskId != null
    );
    if (pendingSubtasks.length > 0) {
      throw new Error("请先完成所有子任务后再转动。");
    }

    const wheelItems = calculateWheelItems({ tasks, rewards, roundState });
    if (wheelItems.length === 0) {
      throw new Error("No active items on the wheel.");
    }

    const winner = pickWinner(wheelItems);

    const spinResult = {
      id: crypto.randomUUID(),
      type: winner.type,
      itemId: winner.id,
      title: winner.title,
      timestamp: new Date().toISOString(),
      status: "pending" as const,
    };
    await this.spinHistoryRepo.add(spinResult);

    return { winner, wheelItems };
  }
}
