import type { Task } from "../entities/Task";
import type { Reward } from "../entities/Reward";
import type { RoundState } from "../entities/RoundState";
import { getEffectiveWeight } from "./TaskDifficultyService";

export interface WheelItem {
  id: string;
  type: "task" | "reward";
  title: string;
  /** Relative weight used for random selection. */
  weight: number;
  /** Value in [0,1] representing share of wheel area. */
  probability: number;
}

const SCALE = 1000;
const TASK_SHARE = 0.9;
const REWARD_SHARE = 0.1;

/**
 * Computes the wheel items with weights for the current round.
 *
 * - Tasks occupy 90 % of the wheel; rewards 10 % (when both exist).
 * - Completed or skipped tasks this round are excluded.
 * - Inactive tasks and inactive rewards are excluded.
 * - In procrastinationRecoveryMode, easy tasks are weighted higher.
 */
export function calculateWheelItems(input: {
  tasks: Task[];
  rewards: Reward[];
  roundState: RoundState;
}): WheelItem[] {
  const { tasks, rewards, roundState } = input;

  const activeTasks = tasks.filter(
    (t) =>
      t.active &&
      !roundState.completedTaskIdsThisRound.includes(t.id) &&
      !roundState.skippedTaskIdsThisRound.includes(t.id)
  );

  const activeRewards = rewards.filter((r) => r.active);

  const hasTasks = activeTasks.length > 0;
  const hasRewards = activeRewards.length > 0;

  if (!hasTasks && !hasRewards) return [];

  const items: WheelItem[] = [];

  if (hasTasks && hasRewards) {
    const rewardRawTotal = activeRewards.reduce((s, r) => s + r.baseWeight, 0);
    activeRewards.forEach((r) => {
      const w = ((r.baseWeight / rewardRawTotal) * REWARD_SHARE * SCALE);
      items.push({ id: r.id, type: "reward", title: r.title, weight: w, probability: 0 });
    });

    const taskEffTotal = activeTasks.reduce(
      (s, t) => s + getEffectiveWeight(t, roundState.procrastinationRecoveryMode),
      0
    );
    activeTasks.forEach((t) => {
      const w =
        (getEffectiveWeight(t, roundState.procrastinationRecoveryMode) /
          taskEffTotal) *
        TASK_SHARE *
        SCALE;
      items.push({ id: t.id, type: "task", title: t.title, weight: w, probability: 0 });
    });
  } else if (hasTasks) {
    const taskEffTotal = activeTasks.reduce(
      (s, t) => s + getEffectiveWeight(t, roundState.procrastinationRecoveryMode),
      0
    );
    activeTasks.forEach((t) => {
      items.push({
        id: t.id,
        type: "task",
        title: t.title,
        weight: getEffectiveWeight(t, roundState.procrastinationRecoveryMode),
        probability: 0,
      });
      // normalize probability after
      void taskEffTotal;
    });
  } else {
    activeRewards.forEach((r) => {
      items.push({ id: r.id, type: "reward", title: r.title, weight: r.baseWeight, probability: 0 });
    });
  }

  // Fill in normalized probabilities
  const totalWeight = items.reduce((s, item) => s + item.weight, 0);
  items.forEach((item) => {
    item.probability = totalWeight > 0 ? item.weight / totalWeight : 0;
  });

  return items;
}

/** Weighted random selection from wheel items. */
export function pickWinner(items: WheelItem[]): WheelItem {
  const totalWeight = items.reduce((s, item) => s + item.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const item of items) {
    rand -= item.weight;
    if (rand < 0) return item;
  }
  return items[items.length - 1];
}
