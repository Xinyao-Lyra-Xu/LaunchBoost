import type { AchievementsViewModel } from "../../../interface-adapters/viewModels/AchievementsViewModel";

interface AchievementsPanelProps {
  vm: AchievementsViewModel;
}

export function AchievementsPanel({ vm }: AchievementsPanelProps) {
  return (
    <div className="panel" id="achievements-panel">
      <div className="panel-header">
        <h2>🏅 成就</h2>
        <span className="panel-hint">
          {vm.unlockedCount}/{vm.total}
        </span>
      </div>
      <div className="achievements-grid">
        {vm.items.map((a) => (
          <div key={a.id} className={`achievement-item ${a.unlocked ? "unlocked" : "locked"}`}>
            <div className="achievement-tooltip">{a.desc}</div>
            <span className="achievement-icon">{a.icon}</span>
            <span className="achievement-name">{a.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
