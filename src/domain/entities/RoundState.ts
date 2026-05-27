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

  // ── Skip-card system (dynamic earn + cap) ─────────────────────────────────
  /** Current skip-card count (0 – SKIP_CARD_MAX). Earned by completing tasks. */
  skipCardsLeft: number;
  /** Progress toward the next skip card (0 – TASKS_PER_CARD-1). */
  skipCardProgress: number;
  /**
   * "YYYY-M-D" of the last day a daily-bonus progress point was awarded.
   * First task completion each calendar day grants +1 extra progress.
   */
  skipCardProgressDate: string;
  /**
   * Number of consecutive skips since the last completed task.
   * Capped at 1 — must complete a task before skipping again.
   */
  consecutiveSkips: number;

  // ── Gates ─────────────────────────────────────────────────────────────────
  /**
   * ID of the task that was procrastinated and must be split before the next spin.
   * Null means no split is pending.
   */
  pendingSplitTaskId: string | null;
  /**
   * ID of the task that was last landed on by the wheel and has not yet been
   * resolved with "Complete" or a skip card. Blocks the next spin until cleared.
   * Null means no task is currently in progress.
   */
  activeTaskId: string | null;
}
