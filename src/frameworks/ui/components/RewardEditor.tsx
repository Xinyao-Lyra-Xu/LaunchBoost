import { useEffect, useRef } from "react";
import type { Reward } from "../../../domain/entities/Reward";

interface RewardEditorProps {
  isOpen: boolean;
  reward: Reward | null;
  onClose(): void;
  onSave(title: string, durationMinutes: number): void;
}

export function RewardEditor({ isOpen, reward, onClose, onSave }: RewardEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => titleRef.current?.focus(), 60);
  }, [isOpen]);

  if (!isOpen) return null;

  function handleConfirm() {
    const title = (titleRef.current?.value ?? "").trim();
    if (!title) return;
    const durInput = document.getElementById("re-duration") as HTMLInputElement;
    const dur = Math.max(1, parseInt(durInput?.value ?? "30") || 30);
    onSave(title, dur);
  }

  return (
    <div id="reward-edit-modal" className="modal">
      <div className="modal-backdrop" id="reward-edit-backdrop" onClick={onClose} />
      <div className="modal-content task-edit-content">
        <h3>编辑奖励</h3>
        <div className="form-grid">
          <div className="form-row full">
            <label>奖励名称</label>
            <input
              ref={titleRef}
              type="text"
              id="re-title"
              className="edit-input"
              placeholder="输入奖励名称..."
              maxLength={30}
              defaultValue={reward?.title ?? ""}
            />
          </div>
          <div className="form-row">
            <label>时长（分钟）</label>
            <input
              type="number"
              id="re-duration"
              className="edit-input"
              min={1}
              max={480}
              defaultValue={reward?.durationMinutes ?? 30}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button id="reward-edit-cancel" className="btn-secondary" onClick={onClose}>取消</button>
          <button id="reward-edit-confirm" className="btn-primary" onClick={handleConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}
