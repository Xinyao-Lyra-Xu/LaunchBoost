import type { StatsRepository, AppStats } from "../../application/ports/StatsRepository";
import { dataStore } from "./ElectronIpcDataStore";

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const DEFAULT_STATS: AppStats = {
  completedToday: 0,
  procrastinatedToday: 0,
  skippedToday: 0,
  rewardsBankedToday: 0,
  totalCompleted: 0,
  totalProcrastinated: 0,
  totalSkipped: 0,
  totalRewardsBanked: 0,
  totalMinutes: 0,
  activeDays: 0,
  lastActiveDate: "",
  todayKey: getTodayKey(),
};

export class ElectronIpcStatsRepository implements StatsRepository {
  async get(): Promise<AppStats> {
    const data = await dataStore.get();
    const s = data.meta?.stats ?? {};
    const todayKey = getTodayKey();
    const base: AppStats = {
      totalCompleted: s.totalCompleted ?? 0,
      totalProcrastinated: s.totalProcrastinated ?? 0,
      totalSkipped: s.totalSkipped ?? 0,
      totalRewardsBanked: s.totalRewardsBanked ?? 0,
      totalMinutes: s.totalMinutes ?? 0,
      activeDays: s.activeDays ?? 0,
      lastActiveDate: s.lastActiveDate ?? "",
      todayKey,
      completedToday: 0,
      procrastinatedToday: 0,
      skippedToday: 0,
      rewardsBankedToday: 0,
    };
    if (s.todayKey === todayKey) {
      return {
        ...base,
        completedToday: s.completedToday ?? 0,
        procrastinatedToday: s.procrastinatedToday ?? 0,
        skippedToday: s.skippedToday ?? 0,
        rewardsBankedToday: s.rewardsBankedToday ?? 0,
      };
    }
    return base;
  }

  async save(stats: AppStats): Promise<void> {
    const data = await dataStore.get();
    data.meta = data.meta ?? {};
    data.meta.stats = {
      todayKey: stats.todayKey,
      completedToday: stats.completedToday,
      procrastinatedToday: stats.procrastinatedToday,
      skippedToday: stats.skippedToday,
      rewardsBankedToday: stats.rewardsBankedToday,
      totalCompleted: stats.totalCompleted,
      totalProcrastinated: stats.totalProcrastinated,
      totalSkipped: stats.totalSkipped,
      totalRewardsBanked: stats.totalRewardsBanked,
      totalMinutes: stats.totalMinutes,
      activeDays: stats.activeDays,
      lastActiveDate: stats.lastActiveDate,
    };
    await dataStore.save(data);
  }
}

export { DEFAULT_STATS };
