import type { AchievementRepository } from "../../application/ports/AchievementRepository";
import { dataStore } from "./ElectronIpcDataStore";

/** Stores the unlocked-achievement map under meta.achievements. */
export class ElectronIpcAchievementRepository implements AchievementRepository {
  async get(): Promise<Record<string, boolean>> {
    const data = await dataStore.get();
    const a = data.meta?.achievements;
    return a && typeof a === "object" ? { ...a } : {};
  }

  async save(unlocked: Record<string, boolean>): Promise<void> {
    const data = await dataStore.get();
    data.meta = data.meta ?? {};
    data.meta.achievements = unlocked;
    await dataStore.save(data);
  }
}
