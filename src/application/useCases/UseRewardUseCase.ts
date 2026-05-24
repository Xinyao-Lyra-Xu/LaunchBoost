import type { RewardRepository } from "../ports/RewardRepository";
import type { Reward } from "../../domain/entities/Reward";

export interface UseRewardOutput {
  reward: Reward;
}

export class UseRewardUseCase {
  constructor(private rewardRepo: RewardRepository) {}

  async execute(rewardId: string, fromBank: boolean): Promise<UseRewardOutput> {
    const rewards = await this.rewardRepo.getAll();
    const reward = rewards.find((r) => r.id === rewardId);
    if (!reward) throw new Error(`Reward ${rewardId} not found`);

    if (fromBank) {
      if (reward.bankedCount <= 0) throw new Error("No banked rewards to use.");
      reward.bankedCount -= 1;
      await this.rewardRepo.update(reward);
    }

    return { reward };
  }
}
