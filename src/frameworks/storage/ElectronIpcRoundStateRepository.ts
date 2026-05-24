import type { RoundStateRepository } from "../../application/ports/RoundStateRepository";
import type { RoundState } from "../../domain/entities/RoundState";
import { dataStore } from "./ElectronIpcDataStore";

const SKIP_CARDS_PER_WEEK = 2;

function getWeekKey(): string {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
  );
  return `${d.getFullYear()}-W${week}`;
}

export class ElectronIpcRoundStateRepository implements RoundStateRepository {
  async get(): Promise<RoundState> {
    const data = await dataStore.get();
    const meta = data.meta ?? {};
    const skipCards = meta.skipCards;
    const currentWeek = getWeekKey();

    let skipCardsLeft = SKIP_CARDS_PER_WEEK;
    let lastResetDate = currentWeek;
    if (skipCards && skipCards.weekKey === currentWeek) {
      skipCardsLeft = skipCards.count;
      lastResetDate = skipCards.weekKey;
    }

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
      lastSkipCardResetDate: lastResetDate,
    };
  }

  async save(state: RoundState): Promise<void> {
    const data = await dataStore.get();

    // Persist skip cards
    data.meta = data.meta ?? {};
    data.meta.skipCards = {
      count: state.skipCardsLeft,
      weekKey: state.lastSkipCardResetDate || getWeekKey(),
    };

    // Sync task flags from round state
    data.tasks.forEach((t) => {
      const id = String(t.id);
      const isCompleted = state.completedTaskIdsThisRound.includes(id);
      const isSkipped = state.skippedTaskIdsThisRound.includes(id);
      t.completed = isCompleted;
      t.activeInCurrentRound = !isCompleted && !isSkipped;
    });

    await dataStore.save(data);
  }
}
