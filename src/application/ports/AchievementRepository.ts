/** Persists the map of unlocked achievement ids. */
export interface AchievementRepository {
  get(): Promise<Record<string, boolean>>;
  save(unlocked: Record<string, boolean>): Promise<void>;
}
