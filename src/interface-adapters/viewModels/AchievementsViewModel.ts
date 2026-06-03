export interface AchievementItemViewModel {
  id: string;
  icon: string;
  name: string;
  desc: string;
  unlocked: boolean;
}

export interface AchievementsViewModel {
  items: AchievementItemViewModel[];
  unlockedCount: number;
  total: number;
}
