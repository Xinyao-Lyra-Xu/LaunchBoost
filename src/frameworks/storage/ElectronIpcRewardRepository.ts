import type { RewardRepository } from "../../application/ports/RewardRepository";
import type { Reward } from "../../domain/entities/Reward";
import type { PersistedReward } from "../../electron";
import { dataStore } from "./ElectronIpcDataStore";

function toReward(p: PersistedReward): Reward {
  return {
    id: String(p.id),
    title: p.title || "未命名奖励",
    durationMinutes: p.durationMinutes || 30,
    baseWeight: p.weight || 1,
    bankedCount: p.banked || 0,
    active: p.active !== undefined ? p.active : true,
  };
}

function toPersisted(r: Reward, index: number): PersistedReward {
  const numId = parseInt(r.id, 10);
  return {
    id: isNaN(numId) ? index + 1 : numId,
    title: r.title,
    durationMinutes: r.durationMinutes,
    weight: r.baseWeight,
    banked: r.bankedCount,
    active: r.active,
  };
}

export class ElectronIpcRewardRepository implements RewardRepository {
  async getAll(): Promise<Reward[]> {
    const data = await dataStore.get();
    return data.rewards.map(toReward);
  }

  async saveAll(rewards: Reward[]): Promise<void> {
    const data = await dataStore.get();
    data.rewards = rewards.map(toPersisted);
    await dataStore.save(data);
  }

  async update(reward: Reward): Promise<void> {
    const data = await dataStore.get();
    const idx = data.rewards.findIndex((p) => String(p.id) === reward.id);
    if (idx !== -1) {
      data.rewards[idx] = toPersisted(reward, idx);
    } else {
      data.rewards.push(toPersisted(reward, data.rewards.length));
    }
    await dataStore.save(data);
  }
}
