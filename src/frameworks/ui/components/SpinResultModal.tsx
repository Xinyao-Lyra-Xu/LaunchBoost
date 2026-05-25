import type { WheelDisplayItem } from "../../../interface-adapters/viewModels/SpinnerViewModel";
import type { Task } from "../../../domain/entities/Task";
import type { Reward } from "../../../domain/entities/Reward";
import { CATEGORY_LABELS } from "../../../domain/valueObjects/TaskCategory";
import { DIFFICULTY_LABELS } from "../../../domain/valueObjects/TaskDifficulty";

interface SpinResultModalProps {
  winnerId: string | null;
  winnerType: "task" | "reward" | null;
  tasks: Task[];
  rewards: Reward[];
  skipCardsLeft: number;
  onCompleteTask(): void;
  onProcrastinateTask(): void;
  onSkipTask(): void;
  onUseRewardNow(): void;
  onBankReward(): void;
}

export function SpinResultModal({
  winnerId,
  winnerType,
  tasks,
  rewards,
  skipCardsLeft,
  onCompleteTask,
  onProcrastinateTask,
  onSkipTask,
  onUseRewardNow,
  onBankReward,
}: SpinResultModalProps) {
  const isOpen = winnerId !== null;

  if (!isOpen) return null;

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

  const task = tasks.find((t) => t.id === winnerId);
  if (!task) return null;

  const catLabel = CATEGORY_LABELS[task.category] ?? task.category;
  const diffLabel = DIFFICULTY_LABELS[task.difficulty] ?? task.difficulty;
  const mins = task.estimatedMinutes ?? 15;

  return (
    <div id="result-modal" className="modal">
      <div className="modal-backdrop" id="result-backdrop" />
      <div className="modal-content task-result" id="modal-content">
        <div className="modal-emoji" id="modal-emoji">📚</div>
        <div className="modal-type" id="modal-type">
          {catLabel} · {diffLabel} · {mins} 分钟
        </div>
        <div className="modal-title" id="modal-title">{task.title}</div>
        <div className="modal-desc" id="modal-desc">
          加油！完成这个任务，你会离目标更近一步！
        </div>
        <div className="modal-actions" id="modal-actions">
          <button className="btn-complete" onClick={onCompleteTask}>
            完成 ✓
          </button>
          <button className="btn-procrastinate" onClick={onProcrastinateTask}>
            拖延了 😅
          </button>
          <button
            className="btn-skip"
            onClick={onSkipTask}
            disabled={skipCardsLeft === 0}
          >
            使用跳过卡 🃏 ({skipCardsLeft})
          </button>
        </div>
      </div>
    </div>
  );
}
