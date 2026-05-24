export type SpinResultStatus =
  | "pending"
  | "done"
  | "procrastinated"
  | "skipped"
  | "banked"
  | "used";

export interface SpinResult {
  id: string;
  type: "task" | "reward";
  /** ID of the Task or Reward that was landed on. */
  itemId: string;
  title: string;
  /** ISO 8601 timestamp of when the spin occurred. */
  timestamp: string;
  status: SpinResultStatus;
}
