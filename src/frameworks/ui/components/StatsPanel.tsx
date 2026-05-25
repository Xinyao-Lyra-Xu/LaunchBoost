import type { StatsViewModel } from "../../../interface-adapters/viewModels/StatsViewModel";

interface RoundProgressProps {
  vm: StatsViewModel;
  onReset(): void;
}

export function RoundProgressPanel({ vm, onReset }: RoundProgressProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📊 本轮进度</h2>
        <button id="reset-tasks-btn" className="reset-btn" onClick={onReset}>
          ↺ 重置本轮
        </button>
      </div>
      <div id="round-progress">
        <div className="progress-row">
          <span className="progress-label">
            完成 {vm.roundCompletedCount} / {vm.roundTotalCount} 个任务
          </span>
          <span className="progress-pct">{vm.roundPct}%</span>
        </div>
        <div className="progress-bar-bg">
          <div className="progress-bar-fill" style={{ width: `${vm.roundPct}%` }} />
        </div>
        <div className="progress-details">
          <span>🔄 待完成 {vm.roundActiveTasks}</span>
          <span>✅ 已完成 {vm.roundCompletedCount}</span>
          <span>🏆 奖励 {vm.rewardCount} 个</span>
        </div>
      </div>
    </div>
  );
}

interface StatsPanelProps {
  vm: StatsViewModel;
}

export function StatsPanel({ vm }: StatsPanelProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📈 今日统计</h2>
      </div>
      <div id="stats-panel-body">
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-num">{vm.completedToday}</span>
            <span className="stat-lbl">今日完成</span>
          </div>
          <div className="stat-item">
            <span className="stat-num">{vm.procrastinatedToday}</span>
            <span className="stat-lbl">今日拖延</span>
          </div>
          <div className="stat-item">
            <span className="stat-num">{vm.skippedToday}</span>
            <span className="stat-lbl">今日跳过</span>
          </div>
          <div className="stat-item">
            <span className="stat-num">{vm.rewardsBankedToday}</span>
            <span className="stat-lbl">今日存奖</span>
          </div>
        </div>
        <div className="stats-total">
          累计: 完成 {vm.totalCompleted} · 拖延 {vm.totalProcrastinated} · 跳过{" "}
          {vm.totalSkipped} · 存奖 {vm.totalRewardsBanked}
        </div>
      </div>
    </div>
  );
}
