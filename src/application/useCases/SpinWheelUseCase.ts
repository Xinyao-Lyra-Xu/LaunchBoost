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
