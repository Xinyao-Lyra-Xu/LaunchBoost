import type { StatsRepository } from "../../application/ports/StatsRepository";
import type { CheckAchievementsUseCase } from "../../application/useCases/CheckAchievementsUseCase";
import { getTodayKey } from "../../application/useCases/statsHelpers";
import type { AchievementsViewModel } from "../viewModels/AchievementsViewModel";

export interface AchievementRefresh {
  vm: AchievementsViewModel;
  /** Display labels for achievements unlocked since the last check. */
  newlyUnlocked: string[];
}

export class AchievementController {
  constructor(
    private statsRepo: StatsRepository,
    private checkAchievementsUseCase: CheckAchievementsUseCase,
  ) {}

  /** Records today as an active day (once per calendar day), then evaluates. */
  async init(): Promise<AchievementRefresh> {
    const stats = await this.statsRepo.get();
    const today = getTodayKey();
    if (stats.lastActiveDate !== today) {
      await this.statsRepo.save({
        ...stats,
        activeDays: stats.activeDays + 1,
        lastActiveDate: today,
      });
    }
    return this.refresh();
  }

  async refresh(): Promise<AchievementRefresh> {
    const { items, newlyUnlocked } = await this.checkAchievementsUseCase.execute();
    return {
      vm: {
        items,
        unlockedCount: items.filter((i) => i.unlocked).length,
        total: items.length,
      },
      newlyUnlocked,
    };
  }
}
