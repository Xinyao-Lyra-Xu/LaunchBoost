export interface AppStats {
  completedToday: number;
  procrastinatedToday: number;
  skippedToday: number;
  rewardsBankedToday: number;
  totalCompleted: number;
  totalProcrastinated: number;
  totalSkipped: number;
  totalRewardsBanked: number;
  /** Lifetime focus minutes accumulated from task timers. */
  totalMinutes: number;
  /** Distinct calendar days the app has been opened. */
  activeDays: number;
  /** YYYY-M-D of the most recent active day, for activeDays bookkeeping. */
  lastActiveDate: string;
  /** YYYY-M-D key used to detect day rollover. */
  todayKey: string;
}

export interface StatsRepository {
  get(): Promise<AppStats>;
  save(stats: AppStats): Promise<void>;
}
