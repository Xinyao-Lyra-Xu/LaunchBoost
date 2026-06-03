import { describe, it, expect } from "vitest";
import { ACHIEVEMENTS, evaluateAchievements, type AchievementContext } from "../AchievementService";

const ZERO: AchievementContext = {
  totalCompleted: 0,
  completedToday: 0,
  skipCardsLeft: 0,
  totalSkipped: 0,
  totalMinutes: 0,
  activeDays: 0,
};

describe("evaluateAchievements", () => {
  it("unlocks nothing for a brand-new context", () => {
    const { unlocked, newlyUnlocked } = evaluateAchievements(ZERO, {});
    expect(newlyUnlocked).toHaveLength(0);
    expect(Object.keys(unlocked)).toHaveLength(0);
  });

  it("unlocks firstTask after one completion", () => {
    const { unlocked, newlyUnlocked } = evaluateAchievements({ ...ZERO, totalCompleted: 1 }, {});
    expect(unlocked.firstTask).toBe(true);
    expect(newlyUnlocked.map((a) => a.id)).toContain("firstTask");
  });

  it("unlocks focus milestones by accumulated minutes", () => {
    expect(evaluateAchievements({ ...ZERO, totalMinutes: 60 }, {}).unlocked.focus60).toBe(true);
    expect(
      evaluateAchievements({ ...ZERO, totalMinutes: 59 }, {}).unlocked.focus60,
    ).toBeUndefined();
    expect(evaluateAchievements({ ...ZERO, totalMinutes: 300 }, {}).unlocked.focus300).toBe(true);
  });

  it("ironWill requires 10 completions with zero skips", () => {
    expect(
      evaluateAchievements({ ...ZERO, totalCompleted: 10, totalSkipped: 0 }, {}).unlocked.ironWill,
    ).toBe(true);
    expect(
      evaluateAchievements({ ...ZERO, totalCompleted: 10, totalSkipped: 1 }, {}).unlocked.ironWill,
    ).toBeUndefined();
  });

  it("is sticky: keeps prior unlocks and does not re-report them", () => {
    const { unlocked, newlyUnlocked } = evaluateAchievements(ZERO, { firstTask: true });
    expect(unlocked.firstTask).toBe(true);
    expect(newlyUnlocked).toHaveLength(0);
  });

  it("only reports the achievements newly satisfied in this evaluation", () => {
    const ctx: AchievementContext = { ...ZERO, totalCompleted: 1, completedToday: 5 };
    const { newlyUnlocked } = evaluateAchievements(ctx, { firstTask: true });
    expect(newlyUnlocked.map((a) => a.id)).toEqual(["sprint5"]);
  });

  it("defines a condition for every catalogued achievement", () => {
    const allConditionsMet: AchievementContext = {
      totalCompleted: 100,
      completedToday: 100,
      skipCardsLeft: 3,
      totalSkipped: 0,
      totalMinutes: 1000,
      activeDays: 30,
    };
    const { unlocked } = evaluateAchievements(allConditionsMet, {});
    for (const def of ACHIEVEMENTS) {
      expect(unlocked[def.id], `${def.id} should unlock when all thresholds are met`).toBe(true);
    }
  });
});
