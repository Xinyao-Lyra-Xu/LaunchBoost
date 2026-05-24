export interface Reward {
  id: string;
  title: string;
  durationMinutes: number;
  /** Base probability weight. */
  baseWeight: number;
  /** Number of rewards saved to the bank for later use. */
  bankedCount: number;
  /** False means the reward is hidden from the wheel. */
  active: boolean;
}
