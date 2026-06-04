import { useState } from "react";
import type { ApiKeyStatus } from "../../../electron";

interface SettingsModalProps {
  isOpen: boolean;
  status: ApiKeyStatus | null;
  onClose(): void;
  /** Pass an empty string to clear the stored key. */
  onSaveKey(key: string): void;
}

const SOURCE_LABEL: Record<ApiKeyStatus["source"], string> = {
  env: "已配置（来自环境变量 ANTHROPIC_API_KEY）",
  encrypted: "已配置（已加密存储 🔒）",
  config: "已配置（明文 config.json — 建议在下方重新保存以加密）",
  none: "未配置（任务拆解将使用本地模板）",
};

export function SettingsModal({ isOpen, status, onClose, onSaveKey }: SettingsModalProps) {
  const [keyInput, setKeyInput] = useState("");

  if (!isOpen) return null;

  const fromEnv = status?.source === "env";

  return (
    <div className="modal" id="settings-modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-content">
        <div className="modal-type">⚙️ 设置</div>
        <h3 style={{ margin: "12px 0 6px" }}>Anthropic API 密钥</h3>
        <p style={{ opacity: 0.8, fontSize: 13, margin: "0 0 4px" }}>
          {status && SOURCE_LABEL[status.source]}
        </p>
        <p style={{ opacity: 0.6, fontSize: 12, margin: "0 0 12px" }}>
          用于任务拆解的 AI 智能拆分。密钥通过系统密钥库加密后保存在本地，不会明文落盘。
        </p>

        {status && !status.encryptionAvailable && (
          <p style={{ color: "#f87171", fontSize: 12 }}>
            ⚠️ 当前系统的加密存储不可用，无法安全保存密钥。
          </p>
        )}

        {fromEnv ? (
          <p style={{ opacity: 0.7, fontSize: 13 }}>
            密钥来自环境变量，优先级最高。如需改用加密存储，请先取消该环境变量。
          </p>
        ) : (
          <>
            <input
              type="password"
              className="edit-input"
              placeholder="sk-ant-..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              style={{ width: "100%", marginBottom: 12 }}
            />
            <div className="modal-actions">
              <button
                className="btn-complete"
                disabled={!keyInput.trim() || !status?.encryptionAvailable}
                onClick={() => {
                  onSaveKey(keyInput.trim());
                  setKeyInput("");
                }}
              >
                🔒 加密保存
              </button>
              {status?.hasKey && (
                <button className="btn-secondary" onClick={() => onSaveKey("")}>
                  清除密钥
                </button>
              )}
            </div>
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn-text-muted" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
