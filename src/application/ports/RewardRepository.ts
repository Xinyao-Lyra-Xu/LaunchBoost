import type { Reward } from "../../domain/entities/Reward";

export interface RewardRepository {
  getAll(): Promise<Reward[]>;
  saveAll(rewards: Reward[]): Promise<void>;
  update(reward: Reward): Promise<void>;
}
