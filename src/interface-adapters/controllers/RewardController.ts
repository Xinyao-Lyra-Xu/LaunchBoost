import type { RewardRepository } from "../../application/ports/RewardRepository";
import type { BankRewardUseCase } from "../../application/useCases/BankRewardUseCase";
import type { UseRewardUseCase } from "../../application/useCases/UseRewardUseCase";
import type { Reward } from "../../domain/entities/Reward";

export class RewardController {
  constructor(
    private rewardRepo: RewardRepository,
    private bankRewardUseCase: BankRewardUseCase,
    private useRewardUseCase: UseRewardUseCase
  ) {}

  async bankReward(rewardId: string) {
    return this.bankRewardUseCase.execute(rewardId);
  }

  async useReward(rewardId: string, fromBank: boolean) {
    return this.useRewardUseCase.execute(rewardId, fromBank);
  }

  async saveReward(id: string, title: string, durationMinutes: number): Promise<Reward> {
    const rewards = await this.rewardRepo.getAll();
    const reward = rewards.find((r) => r.id === id);
    if (!reward) throw new Error(`Reward ${id} not found`);
    reward.title = title;
    reward.durationMinutes = durationMinutes;
    await this.rewardRepo.update(reward);
    return reward;
  }
}
