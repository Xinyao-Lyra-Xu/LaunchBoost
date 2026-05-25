import { useState, useRef } from "react";
import type { Task } from "../../../domain/entities/Task";
import type { SubtaskData } from "../../../application/ports/TaskSplitterGateway";
import type { SplitModalState } from "../hooks/useSpinnerApp";

interface SplitTaskModalProps {
  isOpen: boolean;
  task: Task | null;
  splitState: SplitModalState;
  aiSubtasks: SubtaskData[] | null;
  errorMsg: string;
  onRequestAi(): void;
  onAcceptAi(subtasks: SubtaskData[]): void;
  onRejectAi(): void;
  onConfirmManual(names: string[]): void;
  onCancel(): void;
}

function ManualInputs({
  onConfirm,
  onCancel,
}: {
  onConfirm(names: string[]): void;
  onCancel(): void;
}) {
  const [count, setCount] = useState(2);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function confirm() {
    const names = refs.current
      .slice(0, count)
      .map((el) => el?.value.trim() ?? "")
      .filter(Boolean);
    onConfirm(names);
  }

  return (
    <div id="split-state-manual">
      <div id="split-inputs" className="split-inputs">
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            type="text"
            className="edit-input split-input"
            placeholder={`子任务 ${i + 1}...`}
            maxLength={40}
            ref={(el) => { refs.current[i] = el; }}
          />
        ))}
      </div>
      <div className="split-controls">
        {count > 2 && (
          <button id="split-remove-btn" className="btn-secondary" onClick={() => setCount((c) => c - 1)}>
            － 减少
          </button>
        )}
        {count < 5 && (
          <button id="split-add-btn" className="btn-secondary" onClick={() => setCount((c) => c + 1)}>
            ＋ 添加
          </button>
        )}
      </div>
      <div className="modal-actions">
        <button id="split-cancel-btn" className="btn-secondary" onClick={onCancel}>取消</button>
        <button id="split-confirm-btn" className="btn-primary" onClick={confirm}>确认拆分</button>
      </div>
    </div>
  );
}

function AiResults({
  subtasks,
  onAccept,
  onReject,
}: {
  subtasks: SubtaskData[];
  onAccept(items: SubtaskData[]): void;
  onReject(): void;
}) {
  const [items, setItems] = useState<SubtaskData[]>(subtasks);

  function update(i: number, field: keyof SubtaskData, value: string | number) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  return (
    <div id="split-state-results">
      <p className="split-ai-hint">AI 建议的子任务（可修改）：</p>
      <div id="split-ai-results" className="split-ai-results">
        {items.map((st, i) => (
          <div key={i} className="ai-subtask-item">
            <span className="ai-subtask-num">{i + 1}.</span>
            <input
              type="text"
              className="edit-input ai-subtask-title"
              value={st.title}
              maxLength={40}
              onChange={(e) => update(i, "title", e.target.value)}
            />
            <input
              type="number"
              className="edit-input ai-subtask-min"
              value={st.estimatedMinutes}
              min={1}
              max={120}
              onChange={(e) => update(i, "estimatedMinutes", parseInt(e.target.value) || 15)}
            />
            <span className="ai-subtask-unit">分</span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button id="split-reject-btn" className="btn-secondary" onClick={onReject}>重新选择</button>
        <button id="split-accept-btn" className="btn-primary" onClick={() => onAccept(items)}>确认拆分 ✓</button>
      </div>
    </div>
  );
}

export function SplitTaskModal({
  isOpen,
  task,
  splitState,
  aiSubtasks,
  errorMsg,
  onRequestAi,
  onAcceptAi,
  onRejectAi,
  onConfirmManual,
  onCancel,
}: SplitTaskModalProps) {
  if (!isOpen || !task) return null;

  return (
    <div id="split-modal" className="modal">
      <div className="modal-backdrop" id="split-backdrop" onClick={onCancel} />
      <div className="modal-content task-edit-content">
        <div className="modal-emoji">✂️</div>
        <h3>拆分任务</h3>
        <p className="split-desc">
          将「<span id="split-task-name">{task.title}</span>」拆分为更小的子任务？
        </p>

        {splitState === "choice" && (
          <div id="split-state-choice">
            <div className="split-choice-btns">
              <button id="split-ai-btn" className="btn-ai-split" onClick={onRequestAi}>
                ✨ AI 智能拆分
              </button>
              <button id="split-manual-btn" className="btn-secondary" onClick={onRejectAi}>
                ✏️ 手动拆分
              </button>
            </div>
            <div className="modal-actions">
              <button id="split-no-btn" className="btn-text-muted" onClick={onCancel}>
                不拆分，继续
              </button>
            </div>
          </div>
        )}

        {splitState === "loading" && (
          <div id="split-state-loading">
            <div className="split-loading">
              <div className="loading-spinner" />
              <span>AI 正在分析任务…</span>
            </div>
          </div>
        )}

        {splitState === "results" && aiSubtasks && (
          <AiResults subtasks={aiSubtasks} onAccept={onAcceptAi} onReject={onRejectAi} />
        )}

        {splitState === "error" && (
          <div id="split-state-error">
            <p id="split-error-msg" className="split-error-msg">{errorMsg}</p>
            <div className="modal-actions">
              <button id="split-err-manual-btn" className="btn-secondary" onClick={onRejectAi}>手动拆分</button>
              <button id="split-retry-btn" className="btn-primary" onClick={onRequestAi}>重试</button>
            </div>
          </div>
        )}

        {splitState === "manual" && (
          <ManualInputs onConfirm={onConfirmManual} onCancel={onCancel} />
        )}
      </div>
    </div>
  );
}
