import type { AppStats } from "../ports/StatsRepository";

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Increments today + lifetime counters, resetting daily counters on day change. */
export function bumpStats(
  stats: AppStats,
  todayKey: keyof Pick<
    AppStats,
    | "completedToday"
    | "procrastinatedToday"
    | "skippedToday"
    | "rewardsBankedToday"
  >,
  totalKey: keyof Pick<
    AppStats,
    | "totalCompleted"
    | "totalProcrastinated"
    | "totalSkipped"
    | "totalRewardsBanked"
  >
): AppStats {
  const today = getTodayKey();
  let s: AppStats = stats;
  if (s.todayKey !== today) {
    s = {
      ...s,
      todayKey: today,
      completedToday: 0,
      procrastinatedToday: 0,
      skippedToday: 0,
      rewardsBankedToday: 0,
    };
  }
  return {
    ...s,
    [todayKey]: (s[todayKey] as number) + 1,
    [totalKey]: (s[totalKey] as number) + 1,
  };
}
