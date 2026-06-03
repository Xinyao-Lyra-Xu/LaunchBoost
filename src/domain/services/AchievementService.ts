/**
 * Achievement catalog and pure unlock evaluation.
 *
 * Achievements are sticky: once unlocked they stay unlocked even if the
 * triggering condition later stops holding (e.g. "5 tasks in one day").
 */

export interface AchievementDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

/** Inputs an unlock condition can depend on. */
export interface AchievementContext {
  totalCompleted: number;
  completedToday: number;
  skipCardsLeft: number;
  totalSkipped: number;
  totalMinutes: number;
  activeDays: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "firstTask", icon: "🌱", name: "第一步", desc: "完成第一个任务" },
  { id: "focus60", icon: "⏱️", name: "专注达人", desc: "累计专注 60 分钟" },
  { id: "focus300", icon: "🔥", name: "时间管理大师", desc: "累计专注 300 分钟" },
  { id: "tickets3", icon: "🎫", name: "节制", desc: "同时持有 3 张跳过卷" },
  { id: "ironWill", icon: "💪", name: "铁血意志", desc: "完成 10 个任务且从未跳过" },
  { id: "sprint5", icon: "🏃", name: "冲刺", desc: "单日完成 5 个任务" },
  { id: "habit7", icon: "🗓️", name: "习惯养成", desc: "累计使用 7 天" },
];

type Condition = (c: AchievementContext) => boolean;

const CONDITIONS: Record<string, Condition> = {
  firstTask: (c) => c.totalCompleted >= 1,
  focus60: (c) => c.totalMinutes >= 60,
  focus300: (c) => c.totalMinutes >= 300,
  tickets3: (c) => c.skipCardsLeft >= 3,
  ironWill: (c) => c.totalCompleted >= 10 && c.totalSkipped === 0,
  sprint5: (c) => c.completedToday >= 5,
  habit7: (c) => c.activeDays >= 7,
};

export interface EvaluateResult {
  /** The full unlocked map after applying any newly satisfied conditions. */
  unlocked: Record<string, boolean>;
  /** Achievements that flipped from locked to unlocked in this evaluation. */
  newlyUnlocked: AchievementDef[];
}

/**
 * Returns the updated unlocked map plus any achievements newly satisfied by
 * `ctx`. Already-unlocked achievements are preserved.
 */
export function evaluateAchievements(
  ctx: AchievementContext,
  unlocked: Record<string, boolean>,
): EvaluateResult {
  const next = { ...unlocked };
  const newlyUnlocked: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (!next[def.id] && CONDITIONS[def.id]?.(ctx)) {
      next[def.id] = true;
      newlyUnlocked.push(def);
    }
  }
  return { unlocked: next, newlyUnlocked };
}
