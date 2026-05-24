import type { WheelItem } from "../../domain/services/SpinnerProbabilityService";
import type {
  WheelDisplayItem,
  SpinnerViewModel,
} from "../viewModels/SpinnerViewModel";

const REWARD_COLORS = ["#FBBF24", "#F97316", "#F87171"];
const TASK_COLORS = [
  "#60A5FA", "#34D399", "#A78BFA", "#F472B6",
  "#38BDF8", "#4ADE80", "#C084FC", "#FB923C",
  "#2DD4BF", "#E879F9",
];

export function toWheelDisplayItems(items: WheelItem[]): WheelDisplayItem[] {
  let taskIdx = 0;
  let rewardIdx = 0;
  return items.map((item) => ({
    ...item,
    color:
      item.type === "reward"
        ? REWARD_COLORS[rewardIdx++ % REWARD_COLORS.length]
        : TASK_COLORS[taskIdx++ % TASK_COLORS.length],
  }));
}

export function toSpinnerViewModel(input: {
  items: WheelItem[];
  isSpinning: boolean;
  targetRotation: number;
  activeTasks: number;
  completedTasks: number;
  skipCardsLeft: number;
}): SpinnerViewModel {
  const segments = toWheelDisplayItems(input.items);
  return {
    segments,
    isSpinning: input.isSpinning,
    canSpin: segments.length > 0 && !input.isSpinning,
    targetRotation: input.targetRotation,
    statsLine: `${input.activeTasks} 个任务待完成 · ${input.completedTasks} 个已完成`,
    skipCardsLine: `🃏 跳过卡本周剩余: ${input.skipCardsLeft}/2`,
  };
}
