import type { Task } from "../../../domain/entities/Task";
import { useTaskTimer } from "../hooks/useTaskTimer";

interface SubtaskFocusModalProps {
  isOpen: boolean;
  /** Title of the parent task this chain came from. */
  parentTitle: string;
  /** The current subtask to focus on, or null when none remain. */
  current: Task | null;
  /** 1-based index of the current step. */
  stepIndex: number;
  /** Total number of subtasks in this chain. */
  stepTotal: number;
  onCompleteStep(): void;
  onClose(): void;
}

/**
 * Focus view shown after a task is split. Walks the user through the subtasks
 * one at a time with a countdown timer; the current step is completed here
 * (not by ticking it off in the task list).
 */
export function SubtaskFocusModal({
  isOpen,
  parentTitle,
  current,
  stepIndex,
  stepTotal,
  onCompleteStep,
  onClose,
}: SubtaskFocusModalProps) {
  const minutes = current?.estimatedMinutes ?? 15;
  // Always a countdown for the focus view, reset whenever the step changes.
  const timer = useTaskTimer(
    isOpen && current !== null,
    "countdown",
    minutes * 60,
    current?.id ?? "",
  );

  if (!isOpen || !current) return null;

  const progressPct =
    stepTotal > 0 ? Math.round((Math.max(0, stepIndex - 1) / stepTotal) * 100) : 0;

  return (
    <div className="modal" id="subtask-focus-modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-content chain-mode-content">
        <div className="chain-mode-progress">
          <div className="chain-progress-bar-bg">
            <div className="chain-progress-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="chain-progress-text">
            步骤 {stepIndex} / {stepTotal}
          </span>
        </div>

        <div className="chain-mode-parent">
          <span className="chain-mode-parent-label">父任务</span>
          <span className="chain-mode-parent-title">{parentTitle}</span>
        </div>

        <div className="chain-view-emoji">🎯</div>
        <div className="chain-view-task">{current.title}</div>
        <div className="chain-step-mins">预计 {minutes} 分钟</div>

        <div
          className="chain-timer-display"
          style={timer.isOvertime ? { color: "#f87171" } : undefined}
        >
          {timer.displayTime}
        </div>
        <button className="chain-timer-btn" onClick={timer.toggle}>
          {timer.paused ? "▶ 继续" : "⏸ 暂停"}
        </button>

        <div className="chain-encourage">
          {timer.isOvertime ? "超时了也没关系，专注完成它 💪" : "专注当下这一步，做完就好 ✨"}
        </div>

        <div className="modal-actions">
          <button className="btn-complete" onClick={onCompleteStep}>
            ✓ 完成这一步
          </button>
          <button className="btn-secondary" onClick={onClose}>
            先关闭
          </button>
        </div>
      </div>
    </div>
  );
}
