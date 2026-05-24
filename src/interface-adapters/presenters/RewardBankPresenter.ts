import type { Reward } from "../../domain/entities/Reward";
import type { RewardBankViewModel, RewardBankItem } from "../viewModels/RewardBankViewModel";

const REWARD_COLORS = ["#FBBF24", "#F97316", "#F87171"];

export function toRewardBankViewModel(rewards: Reward[]): RewardBankViewModel {
  const active = rewards.filter((r) => r.active);
  const items: RewardBankItem[] = active.map((r, i) => ({
    id: r.id,
    title: r.title,
    durationMinutes: r.durationMinutes,
    bankedCount: r.bankedCount,
    color: REWARD_COLORS[i % REWARD_COLORS.length],
  }));
  return { items };
}
