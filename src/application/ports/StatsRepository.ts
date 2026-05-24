export interface AppStats {
  completedToday: number;
  procrastinatedToday: number;
  skippedToday: number;
  rewardsBankedToday: number;
  totalCompleted: number;
  totalProcrastinated: number;
  totalSkipped: number;
  totalRewardsBanked: number;
  /** YYYY-M-D key used to detect day rollover. */
  todayKey: string;
}

export interface StatsRepository {
  get(): Promise<AppStats>;
  save(stats: AppStats): Promise<void>;
}
