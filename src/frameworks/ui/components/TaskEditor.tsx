import { useEffect, useRef, useState } from "react";
import type { Task, TaskFrequency } from "../../../domain/entities/Task";
import type { TaskCategory } from "../../../domain/valueObjects/TaskCategory";
import type { TaskDifficulty } from "../../../domain/valueObjects/TaskDifficulty";
import type { TaskEditFields } from "../../../interface-adapters/controllers/TaskController";

interface TaskEditorProps {
  isOpen: boolean;
  task: Task | null;
  onClose(): void;
  onSave(fields: TaskEditFields): void;
}

export function TaskEditor({ isOpen, task, onClose, onSave }: TaskEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [repeatable, setRepeatable] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setRepeatable(task ? task.repeatable !== false : true);
      setTimeout(() => titleRef.current?.focus(), 60);
    }
  }, [isOpen, task]);

  if (!isOpen) return null;

  function handleConfirm() {
    const title = (titleRef.current?.value ?? "").trim();
    if (!title) return;
    const form = document.getElementById("task-edit-form") as HTMLFormElement;
    const data = new FormData(form);
    const rep = (form.querySelector("#te-repeatable") as HTMLInputElement)?.checked ?? true;
    const fields: TaskEditFields = {
      title,
      category: (data.get("category") as TaskCategory) ?? "study",
      difficulty: (data.get("difficulty") as TaskDifficulty) ?? "easy",
      estimatedMinutes: Math.max(1, parseInt(data.get("minutes") as string) || 15),
      baseWeight: Math.min(5, Math.max(1, parseInt(data.get("weight") as string) || 2)),
      repeatable: rep,
      frequency: rep ? ((data.get("frequency") as TaskFrequency) ?? "custom") : "once",
    };
    onSave(fields);
  }

  return (
    <div id="task-edit-modal" className="modal">
      <div className="modal-backdrop" id="task-edit-backdrop" onClick={onClose} />
      <div className="modal-content task-edit-content">
        <h3 id="task-edit-title">{task ? "编辑任务" : "添加新任务"}</h3>
        <form id="task-edit-form">
          <div className="form-grid">
            <div className="form-row full">
              <label>任务名称</label>
              <input
                ref={titleRef}
                type="text"
                id="te-title"
                className="edit-input"
                placeholder="输入任务名称..."
                maxLength={40}
                defaultValue={task?.title ?? ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  if (e.key === "Escape") onClose();
                }}
              />
            </div>
            <div className="form-row">
              <label>分类</label>
              <select name="category" id="te-category" className="edit-select" defaultValue={task?.category ?? "study"}>
                <option value="study">📚 学习</option>
                <option value="life">🏠 生活</option>
                <option value="health">💪 健康</option>
                <option value="project">💻 项目</option>
              </select>
            </div>
            <div className="form-row">
              <label>难度</label>
              <select name="difficulty" id="te-difficulty" className="edit-select" defaultValue={task?.difficulty ?? "easy"}>
                <option value="easy">🟢 简单</option>
                <option value="medium">🟡 中等</option>
                <option value="hard">🔴 困难</option>
              </select>
            </div>
            <div className="form-row">
              <label>预计时间（分钟）</label>
              <input type="number" name="minutes" id="te-minutes" className="edit-input" min={1} max={480} defaultValue={task?.estimatedMinutes ?? 15} />
            </div>
            <div className="form-row">
              <label>权重 (1–5)</label>
              <input type="number" name="weight" id="te-weight" className="edit-input" min={1} max={5} defaultValue={task?.baseWeight ?? 2} />
            </div>
            <div className="form-row full">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  id="te-repeatable"
                  defaultChecked={task ? task.repeatable !== false : true}
                  onChange={(e) => setRepeatable(e.target.checked)}
                />
                <span>重复任务（可多轮出现）</span>
              </label>
            </div>
            {repeatable && (
              <div className="form-row" id="te-freq-row">
                <label>重复频率</label>
                <select name="frequency" id="te-frequency" className="edit-select" defaultValue={task?.frequency ?? "custom"}>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="custom">自定义</option>
                </select>
              </div>
            )}
          </div>
        </form>
        <div className="modal-actions">
          <button id="task-edit-cancel" className="btn-secondary" onClick={onClose}>取消</button>
          <button id="task-edit-confirm" className="btn-primary" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}
