import type { RewardRepository } from "../ports/RewardRepository";
import type { StatsRepository } from "../ports/StatsRepository";
import type { Reward } from "../../domain/entities/Reward";
import type { AppStats } from "../ports/StatsRepository";
import { bumpStats } from "./statsHelpers";

export interface BankRewardOutput {
  reward: Reward;
  stats: AppStats;
}

export class BankRewardUseCase {
  constructor(
    private rewardRepo: RewardRepository,
    private statsRepo: StatsRepository
  ) {}

  async execute(rewardId: string): Promise<BankRewardOutput> {
    const [rewards, stats] = await Promise.all([
      this.rewardRepo.getAll(),
      this.statsRepo.get(),
    ]);

    const reward = rewards.find((r) => r.id === rewardId);
    if (!reward) throw new Error(`Reward ${rewardId} not found`);

    reward.bankedCount += 1;

    const updatedStats = bumpStats(
      stats,
      "rewardsBankedToday",
      "totalRewardsBanked"
    );

    await Promise.all([
      this.rewardRepo.update(reward),
      this.statsRepo.save(updatedStats),
    ]);

    return { reward, stats: updatedStats };
  }
}
