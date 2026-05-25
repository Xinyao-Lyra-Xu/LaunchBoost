import type { RewardBankViewModel } from "../../../interface-adapters/viewModels/RewardBankViewModel";

interface RewardBankProps {
  vm: RewardBankViewModel;
  onEditReward(rewardId: string): void;
  onUseBanked(rewardId: string): void;
}

export function RewardBank({ vm, onEditReward, onUseBanked }: RewardBankProps) {
  return (
    <div className="panel rewards-panel">
      <div className="panel-header">
        <h2>🏆 我的奖励</h2>
        <span className="panel-hint">点击可编辑</span>
      </div>
      <div id="rewards-list" className="items-list">
        {vm.items.map((r) => (
          <div
            key={r.id}
            className="reward-item"
            data-id={r.id}
            onClick={() => onEditReward(r.id)}
            style={{ cursor: "pointer" }}
          >
            <div className="reward-dot" style={{ background: r.color }} />
            <span className="reward-name">{r.title}</span>
            <span className="reward-dur">{r.durationMinutes}分</span>
            {r.bankedCount > 0 && (
              <span className="reward-banked">×{r.bankedCount}</span>
            )}
            {r.bankedCount > 0 && (
              <button
                className="btn-use-banked"
                data-id={r.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onUseBanked(r.id);
                }}
              >
                用一个
              </button>
            )}
            <span className="reward-edit-icon">✏️</span>
          </div>
        ))}
      </div>
    </div>
  );
}
