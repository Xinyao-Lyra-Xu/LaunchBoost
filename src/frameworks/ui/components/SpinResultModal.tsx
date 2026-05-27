import { useEffect, useRef } from "react";
import type { Task } from "../../../domain/entities/Task";
import type { Reward } from "../../../domain/entities/Reward";
import { CATEGORY_LABELS } from "../../../domain/valueObjects/TaskCategory";
import { DIFFICULTY_LABELS } from "../../../domain/valueObjects/TaskDifficulty";
import { useTaskTimer } from "../hooks/useTaskTimer";

/** Must match SkipTaskUseCase.MAX_CONSECUTIVE_SKIPS */
const MAX_CONSECUTIVE_SKIPS = 1;
/** Must match CompleteTaskUseCase.SKIP_CARD_MAX / TASKS_PER_CARD */
const SKIP_CARD_MAX  = 3;
const TASKS_PER_CARD = 3;

interface SpinResultModalProps {
  winnerId: string | null;
  winnerType: "task" | "reward" | null;
  tasks: Task[];
  rewards: Reward[];
  skipCardsLeft: number;
  skipCardProgress: number;
  consecutiveSkips: number;
  onCompleteTask(): void;
  onProcrastinateTask(): void;
  onSkipTask(): void;
  onUseRewardNow(): void;
  onBankReward(): void;
}

function formatDuration(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}秒`;
  if (rem === 0) return `${m}分钟`;
  return `${m}分${rem}秒`;
}

export function SpinResultModal({
  winnerId,
  winnerType,
  tasks,
  rewards,
  skipCardsLeft,
  skipCardProgress,
  consecutiveSkips,
  onCompleteTask,
  onProcrastinateTask,
  onSkipTask,
  onUseRewardNow,
  onBankReward,
}: SpinResultModalProps) {
  // Resolve task first so hooks can use it (hooks must be called unconditionally).
  const task =
    winnerId && winnerType === "task"
      ? (tasks.find((t) => t.id === winnerId) ?? null)
      : null;

  const timerActive = task !== null;
  const timer = useTaskTimer(
    timerActive,
    task?.timerMode ?? "stopwatch",
    (task?.estimatedMinutes ?? 15) * 60,
    winnerId ?? ""
  );

  // Fire a toast once when a countdown reaches zero.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (!timerActive) {
      notifiedRef.current = false;
      return;
    }
    if (timer.isCountdownDone && !notifiedRef.current) {
      notifiedRef.current = true;
      const el = document.createElement("div");
      el.className = "toast";
      el.style.cssText = "background:#f87171;color:#fff;";
      el.textContent = "⏰ 倒计时结束！请选择任务结果";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2800);
    }
  }, [timer.isCountdownDone, timerActive]);

  // ── Early returns (after all hooks) ───────────────────────────────────────
  if (!winnerId) return null;

  if (winnerType === "reward") {
    const reward = rewards.find((r) => r.id === winnerId);
    if (!reward) return null;
    const dur = reward.durationMinutes ?? 30;

    return (
      <div id="result-modal" className="modal">
        <div className="modal-backdrop" id="result-backdrop" />
        <div className="modal-content reward-result" id="modal-content">
          <div className="modal-emoji" id="modal-emoji">🎉</div>
          <div className="modal-type" id="modal-type">✨ 获得奖励</div>
          <div className="modal-title" id="modal-title">{reward.title}</div>
          <div className="modal-desc" id="modal-desc">享受 {dur} 分钟的奖励时间！</div>
          <div className="modal-actions" id="modal-actions">
            <button className="btn-complete" onClick={onUseRewardNow}>
              立即使用 ✓
            </button>
            <button className="btn-bank" onClick={onBankReward}>
              存入奖励库 🏦
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!task) return null;

  const catLabel = CATEGORY_LABELS[task.category] ?? task.category;
  const diffLabel = DIFFICULTY_LABELS[task.difficulty] ?? task.difficulty;
  const mins = task.estimatedMinutes ?? 15;
  const countdownSec = mins * 60;
  const isStopwatch = task.timerMode === "stopwatch";

  // Result feedback line shown beneath the timer digits.
  let resultClass = "";
  let resultText = "";
  if (isStopwatch) {
    if (timer.elapsed > 0) {
      if (timer.elapsed > countdownSec) {
        resultClass = "timer-over";
        resultText = `超出计划 ${formatDuration(timer.elapsed - countdownSec)}`;
      } else {
        resultClass = "timer-ok";
        resultText = `计划内，已用 ${formatDuration(timer.elapsed)}`;
      }
    }
  } else {
    if (timer.isOvertime) {
      resultClass = "timer-over";
      resultText = `超出 ${formatDuration(timer.elapsed - countdownSec)}`;
    } else if (timer.elapsed > 0) {
      resultClass = "timer-under";
      resultText = `还剩 ${formatDuration(countdownSec - timer.elapsed)}`;
    }
  }

  // ── Skip-card display ────────────────────────────────────────────────────
  const canSkip = skipCardsLeft > 0 && consecutiveSkips < MAX_CONSECUTIVE_SKIPS;
  const skipDisabledReason =
    skipCardsLeft <= 0 && consecutiveSkips >= MAX_CONSECUTIVE_SKIPS
      ? "没有跳过卷，且需先完成 1 个任务"
      : skipCardsLeft <= 0
      ? "没有跳过卷了"
      : consecutiveSkips >= MAX_CONSECUTIVE_SKIPS
      ? "需先完成 1 个任务才能再次跳过"
      : null;

  const progressToNext = TASKS_PER_CARD - skipCardProgress;
  const skipHint =
    skipCardsLeft >= SKIP_CARD_MAX
      ? "跳过卷已满"
      : `再完成 ${progressToNext} 个任务可得 1 张`;

  return (
    <div id="result-modal" className="modal">
      <div className="modal-backdrop" id="result-backdrop" />
      <div className="modal-content task-result" id="modal-content">
        <div className="modal-emoji" id="modal-emoji">📚</div>
        <div className="modal-type" id="modal-type">
          {catLabel} · {diffLabel} · {mins} 分钟
        </div>
        <div className="modal-title" id="modal-title">{task.title}</div>

        {/* ── Timer ── */}
        <div className="modal-timer">
          <div className="timer-est-row">
            <span className="timer-label">
              {isStopwatch ? "⏱ 正计时" : "⏳ 倒计时"}
            </span>
            <span className="timer-label" style={{ marginLeft: "auto", opacity: 0.6 }}>
              计划 {mins} 分钟
            </span>
          </div>
          <div
            className="timer-display"
            style={timer.isOvertime ? { color: "#f87171" } : undefined}
          >
            {timer.displayTime}
          </div>
          <div className="timer-controls">
            <button
              className={`timer-btn ${timer.paused ? "timer-up-btn" : "timer-down-btn"}`}
              onClick={timer.toggle}
            >
              {timer.paused ? "▶ 继续" : "⏸ 暂停"}
            </button>
          </div>
          {resultText && (
            <div className={`timer-result ${resultClass}`}>{resultText}</div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="modal-actions" id="modal-actions">
          <button className="btn-complete" onClick={onCompleteTask}>
            完成 ✓
          </button>
          <button className="btn-procrastinate" onClick={onProcrastinateTask}>
            拖延了 😅
          </button>
        </div>

        {/* ── Skip card ── */}
        <div className="skip-card-row">
          <button
            className="btn-skip"
            id="skip-btn"
            onClick={onSkipTask}
            disabled={!canSkip}
            title={skipDisabledReason ?? "使用跳过卷跳过此任务"}
          >
            跳过 🃏 ({skipCardsLeft}/{SKIP_CARD_MAX})
          </button>
          <div className="skip-card-hint" id="skip-hint">
            {skipDisabledReason
              ? `⚠️ ${skipDisabledReason}`
              : skipHint}
          </div>
        </div>
      </div>
    </div>
  );
}
