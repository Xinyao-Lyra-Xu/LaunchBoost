import { useState } from "react";
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

// ── Manual input panel ────────────────────────────────────────────────────────

function ManualInputs({
  onConfirm,
  onBack,
}: {
  onConfirm(names: string[]): void;
  onBack(): void;
}) {
  const [items, setItems] = useState<string[]>(["", ""]);
  const [error, setError] = useState("");

  function addItem() {
    if (items.length < 6) setItems((prev) => [...prev, ""]);
  }

  function removeItem(i: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, value: string) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  function confirm() {
    const names = items.map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
      setError("至少需要填写 1 个子任务");
      return;
    }
    setError("");
    onConfirm(names);
  }

  return (
    <div id="split-state-manual">
      <div id="split-inputs" className="split-inputs">
        {items.map((val, i) => (
          <div key={i} className="manual-subtask-row">
            <input
              type="text"
              className="edit-input split-input"
              placeholder={`子任务 ${i + 1}…`}
              maxLength={40}
              value={val}
              onChange={(e) => updateItem(i, e.target.value)}
            />
            {items.length > 1 && (
              <button
                className="icon-btn delete"
                onClick={() => removeItem(i)}
                title="删除"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="split-error-msg">{error}</p>}
      <div className="split-controls">
        {items.length < 6 && (
          <button id="split-add-btn" className="btn-secondary" onClick={addItem}>
            ＋ 添加子任务
          </button>
        )}
      </div>
      <div className="modal-actions">
        <button id="split-back-btn" className="btn-secondary" onClick={onBack}>
          ← 返回
        </button>
        <button id="split-confirm-btn" className="btn-primary" onClick={confirm}>
          确认拆解
        </button>
      </div>
    </div>
  );
}

// ── AI results panel ──────────────────────────────────────────────────────────

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
  const [error, setError] = useState("");

  function update(i: number, field: keyof SubtaskData, value: string | number) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  }

  function remove(i: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addItem() {
    setItems((prev) => [...prev, { title: "", estimatedMinutes: 15 }]);
  }

  function accept() {
    const valid = items.filter((st) => st.title.trim().length > 0);
    if (valid.length === 0) {
      setError("至少需要 1 个有效子任务");
      return;
    }
    setError("");
    onAccept(valid);
  }

  return (
    <div id="split-state-results">
      <p className="split-ai-hint">AI 建议的子任务（可编辑 / 删除 / 添加）：</p>
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
              onChange={(e) =>
                update(i, "estimatedMinutes", parseInt(e.target.value) || 15)
              }
            />
            <span className="ai-subtask-unit">分</span>
            {items.length > 1 && (
              <button
                className="icon-btn delete"
                onClick={() => remove(i)}
                title="删除"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="split-error-msg">{error}</p>}
      <div className="split-controls">
        <button className="btn-secondary" onClick={addItem}>
          ＋ 添加子任务
        </button>
      </div>
      <div className="modal-actions">
        <button id="split-reject-btn" className="btn-secondary" onClick={onReject}>
          重新选择
        </button>
        <button id="split-accept-btn" className="btn-primary" onClick={accept}>
          确认拆解 ✓
        </button>
      </div>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

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
}: SplitTaskModalProps) {
  if (!isOpen || !task) return null;

  return (
    <div id="split-modal" className="modal">
      {/* Backdrop is intentionally non-interactive: split is mandatory. */}
      <div className="modal-backdrop" id="split-backdrop" />
      <div className="modal-content task-edit-content">
        <div className="modal-emoji">✂️</div>
        <div className="split-mandatory-badge">⚠️ 必须拆解后才能继续转盘</div>
        <h3>拆解任务</h3>
        <p className="split-desc">
          将「<span id="split-task-name">{task.title}</span>
          」拆解为更小的子任务，完成所有子任务后才可继续。
        </p>

        {splitState === "choice" && (
          <div id="split-state-choice">
            <div className="split-choice-btns">
              <button
                id="split-ai-btn"
                className="btn-ai-split"
                onClick={onRequestAi}
              >
                ✨ AI 智能拆解
              </button>
              <button
                id="split-manual-btn"
                className="btn-secondary"
                onClick={onRejectAi}
              >
                ✏️ 手动拆解
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
          <AiResults
            subtasks={aiSubtasks}
            onAccept={onAcceptAi}
            onReject={onRejectAi}
          />
        )}

        {splitState === "error" && (
          <div id="split-state-error">
            <p id="split-error-msg" className="split-error-msg">
              {errorMsg}
            </p>
            <div className="modal-actions">
              <button
                id="split-err-manual-btn"
                className="btn-secondary"
                onClick={onRejectAi}
              >
                手动拆解
              </button>
              <button
                id="split-retry-btn"
                className="btn-primary"
                onClick={onRequestAi}
              >
                重试
              </button>
            </div>
          </div>
        )}

        {splitState === "manual" && (
          <ManualInputs onConfirm={onConfirmManual} onBack={onRejectAi} />
        )}
      </div>
    </div>
  );
}
