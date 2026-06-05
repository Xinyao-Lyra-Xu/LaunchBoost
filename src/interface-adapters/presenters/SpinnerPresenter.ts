import type { WheelItem } from "../../domain/services/SpinnerProbabilityService";
import type { WheelDisplayItem, SpinnerViewModel } from "../viewModels/SpinnerViewModel";

const REWARD_COLORS = ["#FBBF24", "#F97316", "#F87171"];
const TASK_COLORS = [
  "#60A5FA",
  "#34D399",
  "#A78BFA",
  "#F472B6",
  "#38BDF8",
  "#4ADE80",
  "#C084FC",
  "#FB923C",
  "#2DD4BF",
  "#E879F9",
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

/** Minimal shape needed to locate a segment on the wheel. */
type WheelSegmentRef = Pick<WheelItem, "id" | "type" | "weight">;
type WinnerRef = Pick<WheelItem, "id" | "type">;

/**
 * Clockwise degrees from the 12-o'clock pointer to the centre of the winner's
 * segment, for a wheel laid out in the given display order. Returns 0 when the
 * winner isn't found or the wheel has no weight.
 *
 * Matches on BOTH id and type: task and reward id spaces overlap (legacy data
 * numbers each from 1), so matching id alone can resolve to the wrong segment
 * of the other type and land the pointer on the wrong wedge.
 */
export function winnerCenterDegrees(items: WheelSegmentRef[], winner: WinnerRef): number {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) return 0;
  let segStart = 0;
  for (const item of items) {
    const arc = (item.weight / totalWeight) * 360;
    if (item.id === winner.id && item.type === winner.type) {
      return segStart + arc / 2;
    }
    segStart += arc;
  }
  return 0;
}

/**
 * Absolute wheel rotation (degrees, clockwise) that lands the winner's segment
 * centre under the top pointer. `fullSpins` is the extra whole-turn flourish
 * (a multiple of 360). The result modulo 360 always equals the rest angle
 * `(360 - winnerCenterDegrees) % 360`, regardless of `fullSpins` or the
 * accumulated `currentRotation`.
 */
export function computeSpinTarget(
  items: WheelSegmentRef[],
  winner: WinnerRef,
  currentRotation: number,
  fullSpins: number,
): number {
  const centerDeg = winnerCenterDegrees(items, winner);
  const targetMod = (360 - centerDeg) % 360;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const delta = (targetMod - currentMod + 360) % 360;
  return currentRotation + fullSpins + delta;
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
