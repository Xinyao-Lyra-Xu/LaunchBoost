import type { StatsRepository } from "../ports/StatsRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { AchievementRepository } from "../ports/AchievementRepository";
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  type AchievementContext,
} from "../../domain/services/AchievementService";

export interface AchievementItem {
  id: string;
  icon: string;
  name: string;
  desc: string;
  unlocked: boolean;
}

export interface CheckAchievementsOutput {
  items: AchievementItem[];
  /** Display labels (name + icon) for achievements unlocked in this check. */
  newlyUnlocked: string[];
}

/** Evaluates achievement conditions against current stats and persists unlocks. */
export class CheckAchievementsUseCase {
  constructor(
    private statsRepo: StatsRepository,
    private roundStateRepo: RoundStateRepository,
    private achievementRepo: AchievementRepository,
  ) {}

  async execute(): Promise<CheckAchievementsOutput> {
    const [stats, roundState, unlocked] = await Promise.all([
      this.statsRepo.get(),
      this.roundStateRepo.get(),
      this.achievementRepo.get(),
    ]);

    const ctx: AchievementContext = {
      totalCompleted: stats.totalCompleted,
      completedToday: stats.completedToday,
      skipCardsLeft: roundState.skipCardsLeft,
      totalSkipped: stats.totalSkipped,
      totalMinutes: stats.totalMinutes,
      activeDays: stats.activeDays,
    };

    const result = evaluateAchievements(ctx, unlocked);
    if (result.newlyUnlocked.length > 0) {
      await this.achievementRepo.save(result.unlocked);
    }

    const items: AchievementItem[] = ACHIEVEMENTS.map((def) => ({
      ...def,
      unlocked: !!result.unlocked[def.id],
    }));

    return {
      items,
      newlyUnlocked: result.newlyUnlocked.map((a) => `${a.name} ${a.icon}`),
    };
  }
}
