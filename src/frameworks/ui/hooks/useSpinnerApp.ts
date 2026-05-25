import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createAppDependencies } from "../../../composition/createAppDependencies";
import {
  calculateWheelItems,
} from "../../../domain/services/SpinnerProbabilityService";
import {
  toWheelDisplayItems,
} from "../../../interface-adapters/presenters/SpinnerPresenter";
import { toStatsViewModel } from "../../../interface-adapters/presenters/StatsPresenter";
import { toRewardBankViewModel } from "../../../interface-adapters/presenters/RewardBankPresenter";
import { toTaskListItems } from "../../../interface-adapters/presenters/TaskListPresenter";
import type { Task } from "../../../domain/entities/Task";
import type { Reward } from "../../../domain/entities/Reward";
import type { RoundState } from "../../../domain/entities/RoundState";
import type { AppStats } from "../../../application/ports/StatsRepository";
import type { WheelDisplayItem } from "../../../interface-adapters/viewModels/SpinnerViewModel";
import type { SubtaskData } from "../../../application/ports/TaskSplitterGateway";
import type { TaskEditFields } from "../../../interface-adapters/controllers/TaskController";
import type { TaskListItem } from "../../../interface-adapters/presenters/TaskListPresenter";
import type { RewardBankViewModel } from "../../../interface-adapters/viewModels/RewardBankViewModel";
import type { StatsViewModel } from "../../../interface-adapters/viewModels/StatsViewModel";

export type SplitModalState =
  | "choice"
  | "loading"
  | "results"
  | "error"
  | "manual";

export interface SpinnerAppHook {
  // Data
  tasks: Task[];
  rewards: Reward[];
  roundState: RoundState;
  // ViewModels
  wheelSegments: WheelDisplayItem[];
  taskListItems: TaskListItem[];
  rewardBankVM: RewardBankViewModel;
  statsVM: StatsViewModel | null;
  // Spin state
  isSpinning: boolean;
  targetRotation: number;
  currentWinnerId: string | null;
  currentWinnerType: "task" | "reward" | null;
  skipCardsLeft: number;
  // Modals
  taskEditOpen: boolean;
  taskBeingEdited: Task | null;
  rewardEditOpen: boolean;
  rewardBeingEdited: Reward | null;
  splitOpen: boolean;
  taskBeingSplit: Task | null;
  splitState: SplitModalState;
  aiSubtasks: SubtaskData[] | null;
  splitErrorMsg: string;
  bulkImportOpen: boolean;
  rulesOpen: boolean;
  // Handlers
  spin(): void;
  onSpinComplete(normalizedRotation: number): void;
  completeTask(): void;
  procrastinateTask(): void;
  skipTask(): void;
  useRewardNow(): void;
  bankReward(): void;
  useBankedReward(rewardId: string): void;
  openTaskEdit(taskId: string | null): void;
  closeTaskEdit(): void;
  saveTaskEdit(fields: TaskEditFields): void;
  deleteTask(taskId: string): void;
  toggleTask(taskId: string): void;
  openRewardEdit(rewardId: string): void;
  closeRewardEdit(): void;
  saveRewardEdit(title: string, durationMinutes: number): void;
  resetRound(): void;
  requestAiSplit(): void;
  acceptAiSplit(subtasks: SubtaskData[]): void;
  rejectAiSplit(): void;
  confirmManualSplit(names: string[]): void;
  cancelSplit(): void;
  openBulkImport(): void;
  closeBulkImport(): void;
  confirmBulkImport(
    lines: Array<{ title: string; category: string; difficulty: string; estimatedMinutes: number }>
  ): void;
  toggleRules(): void;
  showToast(msg: string): void;
}

const deps = createAppDependencies();

const EMPTY_ROUND_STATE: RoundState = {
  completedTaskIdsThisRound: [],
  skippedTaskIdsThisRound: [],
  procrastinationRecoveryMode: false,
  skipCardsLeft: 2,
  lastSkipCardResetDate: "",
};

export function useSpinnerApp(): SpinnerAppHook {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [roundState, setRoundState] = useState<RoundState>(EMPTY_ROUND_STATE);
  const [stats, setStats] = useState<AppStats | null>(null);

  const [isSpinning, setIsSpinning] = useState(false);
  const [targetRotation, setTargetRotation] = useState(0);
  const [totalRotation, setTotalRotation] = useState(0);
  const [currentWinnerId, setCurrentWinnerId] = useState<string | null>(null);
  const [currentWinnerType, setCurrentWinnerType] = useState<"task" | "reward" | null>(null);

  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [taskBeingEdited, setTaskBeingEdited] = useState<Task | null>(null);
  const [rewardEditOpen, setRewardEditOpen] = useState(false);
  const [rewardBeingEdited, setRewardBeingEdited] = useState<Reward | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [taskBeingSplit, setTaskBeingSplit] = useState<Task | null>(null);
  const [splitState, setSplitState] = useState<SplitModalState>("choice");
  const [aiSubtasks, setAiSubtasks] = useState<SubtaskData[] | null>(null);
  const [splitErrorMsg, setSplitErrorMsg] = useState("");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Ref to current winner at spin time (safe across async/timeout)
  const winnerIdRef = useRef<string | null>(null);
  const winnerTypeRef = useRef<"task" | "reward" | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [loadedTasks, loadedRewards, loadedRoundState, loadedStats] =
        await Promise.all([
          deps.taskRepo.getAll(),
          deps.rewardRepo.getAll(),
          deps.roundStateRepo.get(),
          deps.statsRepo.get(),
        ]);
      setTasks(loadedTasks);
      setRewards(loadedRewards);
      setRoundState(loadedRoundState);
      setStats(loadedStats);
    }
    load();
  }, []);

  // ── Derived view models ───────────────────────────────────────────────────
  const wheelItems = useMemo(
    () => calculateWheelItems({ tasks, rewards, roundState }),
    [tasks, rewards, roundState]
  );

  const wheelSegments = useMemo(
    () => toWheelDisplayItems(wheelItems),
    [wheelItems]
  );

  const taskListItems = useMemo(
    () => toTaskListItems(tasks, roundState),
    [tasks, roundState]
  );

  const rewardBankVM = useMemo(
    () => toRewardBankViewModel(rewards),
    [rewards]
  );

  const statsVM = useMemo(
    () =>
      stats
        ? toStatsViewModel({ tasks, rewards, roundState, stats })
        : null,
    [tasks, rewards, roundState, stats]
  );

  // ── Toast ─────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  }, []);

  // ── Reload helpers ────────────────────────────────────────────────────────
  const reloadAll = useCallback(async () => {
    const [t, r, rs, s] = await Promise.all([
      deps.taskRepo.getAll(),
      deps.rewardRepo.getAll(),
      deps.roundStateRepo.get(),
      deps.statsRepo.get(),
    ]);
    setTasks(t);
    setRewards(r);
    setRoundState(rs);
    setStats(s);
  }, []);

  // ── Spin ──────────────────────────────────────────────────────────────────
  const spin = useCallback(() => {
    if (isSpinning || wheelItems.length === 0) return;

    // Spin use case just picks the winner; we also need wheel items here for geometry
    deps.spinController.spin().then((output) => {
      const winner = output.winner;
      winnerIdRef.current = winner.id;
      winnerTypeRef.current = winner.type;

      // Compute rotation to land pointer on winner
      const totalWeight = wheelItems.reduce((s, i) => s + i.weight, 0);
      let segStart = 0;
      let centerDeg = 0;
      for (const item of wheelItems) {
        const arcDeg = (item.weight / totalWeight) * 360;
        if (item.id === winner.id) {
          centerDeg = segStart + arcDeg / 2;
          break;
        }
        segStart += arcDeg;
      }
      const targetMod = (360 - centerDeg) % 360;
      const currentMod = totalRotation % 360;
      const delta = (targetMod - currentMod + 360) % 360;
      const fullSpins = (5 + Math.floor(Math.random() * 4)) * 360;
      const newRotation = totalRotation + fullSpins + delta;

      setIsSpinning(true);
      setTargetRotation(newRotation);
    });
  }, [isSpinning, wheelItems, totalRotation]);

  const onSpinComplete = useCallback((normalizedRotation: number) => {
    setTotalRotation(normalizedRotation);
    setIsSpinning(false);
    setCurrentWinnerId(winnerIdRef.current);
    setCurrentWinnerType(winnerTypeRef.current);
    // Turn off procrastination recovery after a new spin
    setRoundState((prev) => ({ ...prev, procrastinationRecoveryMode: false }));
  }, []);

  // ── Task result actions ───────────────────────────────────────────────────
  const completeTask = useCallback(async () => {
    if (!currentWinnerId) return;
    const out = await deps.taskController.completeTask(currentWinnerId);
    setTasks((prev) =>
      prev.map((t) => (t.id === out.task.id ? out.task : t))
    );
    setRoundState(out.roundState);
    setStats(out.stats);
    setCurrentWinnerId(null);
    setCurrentWinnerType(null);
    showToast("任务完成！继续加油 🎉");
  }, [currentWinnerId, showToast]);

  const procrastinateTask = useCallback(async () => {
    if (!currentWinnerId) return;
    const out = await deps.taskController.procrastinateTask(currentWinnerId);
    setTasks((prev) =>
      prev.map((t) => (t.id === out.task.id ? out.task : t))
    );
    setRoundState(out.roundState);
    setStats(out.stats);
    setCurrentWinnerId(null);
    setCurrentWinnerType(null);

    if (out.shouldOfferSplit) {
      setTaskBeingSplit(out.task);
      setSplitState("choice");
      setAiSubtasks(null);
      setSplitErrorMsg("");
      setSplitOpen(true);
    } else {
      showToast("已记录拖延，下次简单任务概率更高 💪");
    }
  }, [currentWinnerId, showToast]);

  const skipTask = useCallback(async () => {
    if (!currentWinnerId) return;
    try {
      const out = await deps.taskController.skipTask(currentWinnerId);
      setTasks((prev) =>
        prev.map((t) => (t.id === out.task.id ? out.task : t))
      );
      setRoundState(out.roundState);
      setStats(out.stats);
      setCurrentWinnerId(null);
      setCurrentWinnerType(null);
      showToast(
        `任务已跳过！还剩 ${out.roundState.skipCardsLeft} 张跳过卡 🃏`
      );
    } catch (e: unknown) {
      showToast((e as Error).message || "跳过失败");
    }
  }, [currentWinnerId, showToast]);

  // ── Reward result actions ─────────────────────────────────────────────────
  const useRewardNow = useCallback(() => {
    setCurrentWinnerId(null);
    setCurrentWinnerType(null);
    showToast("享受你的奖励吧！🎉");
  }, [showToast]);

  const bankReward = useCallback(async () => {
    if (!currentWinnerId) return;
    const out = await deps.rewardController.bankReward(currentWinnerId);
    setRewards((prev) =>
      prev.map((r) => (r.id === out.reward.id ? out.reward : r))
    );
    setStats(out.stats);
    setCurrentWinnerId(null);
    setCurrentWinnerType(null);
    showToast("奖励已存入奖励库！🏦");
  }, [currentWinnerId, showToast]);

  const useBankedReward = useCallback(
    async (rewardId: string) => {
      const out = await deps.rewardController.useReward(rewardId, true);
      setRewards((prev) =>
        prev.map((r) => (r.id === out.reward.id ? out.reward : r))
      );
      showToast(`享受 "${out.reward.title}" 吧！🎉`);
    },
    [showToast]
  );

  // ── Task CRUD ─────────────────────────────────────────────────────────────
  const openTaskEdit = useCallback(
    (taskId: string | null) => {
      setTaskBeingEdited(taskId ? tasks.find((t) => t.id === taskId) ?? null : null);
      setTaskEditOpen(true);
    },
    [tasks]
  );
  const closeTaskEdit = useCallback(() => setTaskEditOpen(false), []);

  const saveTaskEdit = useCallback(
    async (fields: TaskEditFields) => {
      const saved = await deps.taskController.saveTask(
        taskBeingEdited?.id ?? null,
        fields
      );
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === saved.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setTaskEditOpen(false);
    },
    [taskBeingEdited]
  );

  const deleteTask = useCallback(async (taskId: string) => {
    await deps.taskController.deleteTask(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const toggleTask = useCallback(
    async (taskId: string) => {
      const updated = await deps.taskController.toggleTask(taskId);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      const rs = await deps.roundStateRepo.get();
      setRoundState(rs);
    },
    []
  );

  // ── Reward CRUD ───────────────────────────────────────────────────────────
  const openRewardEdit = useCallback(
    (rewardId: string) => {
      setRewardBeingEdited(rewards.find((r) => r.id === rewardId) ?? null);
      setRewardEditOpen(true);
    },
    [rewards]
  );
  const closeRewardEdit = useCallback(() => setRewardEditOpen(false), []);

  const saveRewardEdit = useCallback(
    async (title: string, durationMinutes: number) => {
      if (!rewardBeingEdited) return;
      const saved = await deps.rewardController.saveReward(
        rewardBeingEdited.id,
        title,
        durationMinutes
      );
      setRewards((prev) =>
        prev.map((r) => (r.id === saved.id ? saved : r))
      );
      setRewardEditOpen(false);
    },
    [rewardBeingEdited]
  );

  // ── Reset Round ───────────────────────────────────────────────────────────
  const resetRound = useCallback(async () => {
    const out = await deps.taskController.resetRound();
    setTasks(out.tasks);
    setRoundState(out.roundState);
    showToast("本轮已重置（重复任务恢复活跃） ↺");
  }, [showToast]);

  // ── Split Task ────────────────────────────────────────────────────────────
  const requestAiSplit = useCallback(async () => {
    if (!taskBeingSplit) return;
    setSplitState("loading");
    try {
      const subtasks = await deps.splitTaskController.requestAiSplit(
        taskBeingSplit.id
      );
      setAiSubtasks(subtasks);
      setSplitState("results");
    } catch (e: unknown) {
      setSplitErrorMsg((e as Error).message || "请求失败");
      setSplitState("error");
    }
  }, [taskBeingSplit]);

  const acceptAiSplit = useCallback(
    async (subtasks: SubtaskData[]) => {
      if (!taskBeingSplit) return;
      const newTasks = await deps.splitTaskController.confirmSplit(
        taskBeingSplit.id,
        subtasks
      );
      await reloadAll();
      setSplitOpen(false);
      setTaskBeingSplit(null);
      showToast(`已拆分为 ${newTasks.length} 个子任务 ✂️`);
    },
    [taskBeingSplit, reloadAll, showToast]
  );

  const rejectAiSplit = useCallback(() => {
    setSplitState("choice");
    setAiSubtasks(null);
  }, []);

  const confirmManualSplit = useCallback(
    async (names: string[]) => {
      if (!taskBeingSplit || names.length === 0) {
        cancelSplit();
        return;
      }
      const subtasks = names.map((title) => ({ title, estimatedMinutes: 15 }));
      await acceptAiSplit(subtasks);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taskBeingSplit, acceptAiSplit]
  );

  const cancelSplit = useCallback(() => {
    setSplitOpen(false);
    setTaskBeingSplit(null);
    showToast("已记录拖延，下次简单任务概率更高 💪");
  }, [showToast]);

  // ── Bulk Import ───────────────────────────────────────────────────────────
  const openBulkImport = useCallback(() => setBulkImportOpen(true), []);
  const closeBulkImport = useCallback(() => setBulkImportOpen(false), []);

  const confirmBulkImport = useCallback(
    async (
      items: Array<{
        title: string;
        category: string;
        difficulty: string;
        estimatedMinutes: number;
      }>
    ) => {
      const VALID_CAT = ["study", "life", "health", "project"] as const;
      const VALID_DIFF = ["easy", "medium", "hard"] as const;
      const mapped = items.map((item) => ({
        title: item.title,
        category: (VALID_CAT.includes(item.category as typeof VALID_CAT[number])
          ? item.category
          : "study") as typeof VALID_CAT[number],
        difficulty: (VALID_DIFF.includes(item.difficulty as typeof VALID_DIFF[number])
          ? item.difficulty
          : "easy") as typeof VALID_DIFF[number],
        estimatedMinutes: item.estimatedMinutes,
      }));
      const newTasks = await deps.taskController.bulkImport(mapped);
      setTasks((prev) => [...prev, ...newTasks]);
      setBulkImportOpen(false);
      showToast(`已导入 ${newTasks.length} 个任务 ✓`);
    },
    [showToast]
  );

  // ── Rules ─────────────────────────────────────────────────────────────────
  const toggleRules = useCallback(() => setRulesOpen((v) => !v), []);

  return {
    tasks,
    rewards,
    roundState,
    wheelSegments,
    taskListItems,
    rewardBankVM,
    statsVM,
    isSpinning,
    targetRotation,
    currentWinnerId,
    currentWinnerType,
    skipCardsLeft: roundState.skipCardsLeft,
    taskEditOpen,
    taskBeingEdited,
    rewardEditOpen,
    rewardBeingEdited,
    splitOpen,
    taskBeingSplit,
    splitState,
    aiSubtasks,
    splitErrorMsg,
    bulkImportOpen,
    rulesOpen,
    spin,
    onSpinComplete,
    completeTask,
    procrastinateTask,
    skipTask,
    useRewardNow,
    bankReward,
    useBankedReward,
    openTaskEdit,
    closeTaskEdit,
    saveTaskEdit,
    deleteTask,
    toggleTask,
    openRewardEdit,
    closeRewardEdit,
    saveRewardEdit,
    resetRound,
    requestAiSplit,
    acceptAiSplit,
    rejectAiSplit,
    confirmManualSplit,
    cancelSplit,
    openBulkImport,
    closeBulkImport,
    confirmBulkImport,
    toggleRules,
    showToast,
  };
}
