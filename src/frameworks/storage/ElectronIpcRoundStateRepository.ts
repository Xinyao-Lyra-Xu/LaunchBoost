import type { RoundStateRepository } from "../../application/ports/RoundStateRepository";
import type { RoundState } from "../../domain/entities/RoundState";
import { dataStore } from "./ElectronIpcDataStore";

/** Skip cards a brand-new user starts with. */
const SKIP_CARD_INITIAL = 1;

export class ElectronIpcRoundStateRepository implements RoundStateRepository {
  async get(): Promise<RoundState> {
    const data = await dataStore.get();
    const meta = data.meta ?? {};
    const sc = meta.skipCards;

    // Gracefully handle both missing data and the old { count, weekKey } format.
    const skipCardsLeft    = sc?.count            ?? SKIP_CARD_INITIAL;
    const skipCardProgress = sc?.progress         ?? 0;
    const consecutiveSkips = sc?.consecutiveSkips ?? 0;
    const skipCardProgressDate = sc?.progressDate ?? "";

    // Derive completed and skipped IDs from task flags
    const completedIds = data.tasks
      .filter((t) => t.completed)
      .map((t) => String(t.id));

    const skippedIds = data.tasks
      .filter((t) => !t.completed && !t.activeInCurrentRound)
      .map((t) => String(t.id));

    return {
      completedTaskIdsThisRound: completedIds,
      skippedTaskIdsThisRound: skippedIds,
      procrastinationRecoveryMode: false,
      skipCardsLeft,
      skipCardProgress,
      consecutiveSkips,
      skipCardProgressDate,
      pendingSplitTaskId: meta.pendingSplitTaskId ?? null,
      activeTaskId: meta.activeTaskId ?? null,
    };
  }

  async save(state: RoundState): Promise<void> {
    const data = await dataStore.get();

    data.meta = data.meta ?? {};
    data.meta.skipCards = {
      count:          state.skipCardsLeft,
      progress:       state.skipCardProgress,
      consecutiveSkips: state.consecutiveSkips,
      progressDate:   state.skipCardProgressDate,
    };

    data.meta.pendingSplitTaskId = state.pendingSplitTaskId;
    data.meta.activeTaskId       = state.activeTaskId;

    // Sync task flags from round state
    data.tasks.forEach((t) => {
      const id = String(t.id);
      const isCompleted = state.completedTaskIdsThisRound.includes(id);
      const isSkipped   = state.skippedTaskIdsThisRound.includes(id);
      t.completed          = isCompleted;
      t.activeInCurrentRound = !isCompleted && !isSkipped;
    });

    await dataStore.save(data);
  }
}
