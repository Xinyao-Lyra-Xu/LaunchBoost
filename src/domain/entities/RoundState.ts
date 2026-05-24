export interface RoundState {
  /** Task IDs completed during the current round (cleared on round reset). */
  completedTaskIdsThisRound: string[];
  /** Task IDs skipped via skip card during the current round. */
  skippedTaskIdsThisRound: string[];
  /**
   * When true, the probability engine gives easy tasks a higher weight.
   * Activated when the user procrastinates; cleared after the next spin.
   */
  procrastinationRecoveryMode: boolean;
  skipCardsLeft: number;
  /** ISO date string (YYYY-MM-DD) of the last weekly skip card reset. */
  lastSkipCardResetDate: string;
}
