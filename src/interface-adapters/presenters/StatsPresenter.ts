import type { Task } from "../../domain/entities/Task";
import type { Reward } from "../../domain/entities/Reward";
import type { RoundState } from "../../domain/entities/RoundState";
import type { AppStats } from "../../application/ports/StatsRepository";
import type { StatsViewModel } from "../viewModels/StatsViewModel";

export function toStatsViewModel(input: {
  tasks: Task[];
  rewards: Reward[];
  roundState: RoundState;
  stats: AppStats;
}): StatsViewModel {
  const { tasks, rewards, roundState, stats } = input;

  // Split subtasks are worked through the focus flow, not the wheel, so they
  // are excluded from round accounting entirely.
  const isSubtask = (id: string) => tasks.find((t) => t.id === id)?.parentTaskId != null;
  const allActive = tasks.filter((t) => t.active && !t.parentTaskId);
  const completedThisRound = roundState.completedTaskIdsThisRound.filter(
    (id) => !isSubtask(id),
  ).length;
  const totalThisRound =
    completedThisRound +
    allActive.filter(
      (t) =>
        !roundState.completedTaskIdsThisRound.includes(t.id) &&
        !roundState.skippedTaskIdsThisRound.includes(t.id),
    ).length;
  const activeTasks = allActive.filter(
    (t) =>
      !roundState.completedTaskIdsThisRound.includes(t.id) &&
      !roundState.skippedTaskIdsThisRound.includes(t.id),
  ).length;
  const pct = totalThisRound > 0 ? Math.round((completedThisRound / totalThisRound) * 100) : 0;

  return {
    completedToday: stats.completedToday,
    procrastinatedToday: stats.procrastinatedToday,
    skippedToday: stats.skippedToday,
    rewardsBankedToday: stats.rewardsBankedToday,
    totalCompleted: stats.totalCompleted,
    totalProcrastinated: stats.totalProcrastinated,
    totalSkipped: stats.totalSkipped,
    totalRewardsBanked: stats.totalRewardsBanked,
    roundCompletedCount: completedThisRound,
    roundTotalCount: totalThisRound,
    roundPct: pct,
    roundActiveTasks: activeTasks,
    rewardCount: rewards.filter((r) => r.active).length,
  };
}
