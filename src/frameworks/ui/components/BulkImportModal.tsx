import { useRef, useState } from "react";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose(): void;
  onImport(
    items: Array<{ title: string; category: string; difficulty: string; estimatedMinutes: number }>
  ): void;
}

const VALID_CAT = ["study", "life", "health", "project"];
const VALID_DIFF = ["easy", "medium", "hard"];

export function BulkImportModal({ isOpen, onClose, onImport }: BulkImportModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  function handleConfirm() {
    const raw = textareaRef.current?.value ?? "";
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const errs: string[] = [];
    const toAdd: Array<{ title: string; category: string; difficulty: string; estimatedMinutes: number }> = [];

    lines.forEach((line, i) => {
      const parts = line.split("|").map((p) => p.trim());
      const title = parts[0];
      if (!title) { errs.push(`第 ${i + 1} 行: 标题不能为空`); return; }
      const cat = parts[1] ?? "";
      const diff = parts[2] ?? "";
      const mins = parseInt(parts[3]);
      const category = VALID_CAT.includes(cat) ? cat : "study";
      const difficulty = VALID_DIFF.includes(diff) ? diff : "easy";
      const estimatedMinutes = mins > 0 ? mins : 15;
      if (cat && !VALID_CAT.includes(cat)) errs.push(`第 ${i + 1} 行: 分类 "${cat}" 无效，已设为 study`);
      if (diff && !VALID_DIFF.includes(diff)) errs.push(`第 ${i + 1} 行: 难度 "${diff}" 无效，已设为 easy`);
      toAdd.push({ title, category, difficulty, estimatedMinutes });
    });

    if (toAdd.length === 0) { setErrors(["没有有效任务可导入"]); return; }
    setErrors(errs);
    onImport(toAdd);
  }

  return (
    <div id="bulk-import-modal" className="modal">
      <div className="modal-backdrop" id="bulk-backdrop" onClick={onClose} />
      <div className="modal-content task-edit-content bulk-modal-content">
        <h3>批量导入任务</h3>
        <p className="bulk-hint">
          每行一个任务，格式：<code>名称 | 分类 | 难度 | 分钟数</code>
          <br />
          分类: study / life / health / project &nbsp;|&nbsp; 难度: easy / medium / hard
        </p>
        <textarea
          ref={textareaRef}
          id="bulk-textarea"
          className="bulk-textarea"
          placeholder={"背单词10个 | study | easy | 15\n做题30分钟 | study | medium | 30\n整理书桌 | life | easy | 10"}
        />
        <pre id="bulk-error" className="bulk-error">
          {errors.join("\n")}
        </pre>
        <div className="modal-actions">
          <button id="bulk-cancel-btn" className="btn-secondary" onClick={onClose}>取消</button>
          <button id="bulk-confirm-btn" className="btn-primary" onClick={handleConfirm}>导入</button>
        </div>
      </div>
    </div>
  );
}
