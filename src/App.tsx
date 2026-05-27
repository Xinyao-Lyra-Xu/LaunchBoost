import { useSpinnerApp } from "./frameworks/ui/hooks/useSpinnerApp";
import { SpinnerWheel } from "./frameworks/ui/components/SpinnerWheel";
import { SpinResultModal } from "./frameworks/ui/components/SpinResultModal";
import { TaskEditor } from "./frameworks/ui/components/TaskEditor";
import { RewardEditor } from "./frameworks/ui/components/RewardEditor";
import { RewardBank } from "./frameworks/ui/components/RewardBank";
import { SplitTaskModal } from "./frameworks/ui/components/SplitTaskModal";
import { BulkImportModal } from "./frameworks/ui/components/BulkImportModal";
import { RoundProgressPanel, StatsPanel } from "./frameworks/ui/components/StatsPanel";

const TASK_COLORS = [
  "#60A5FA", "#34D399", "#A78BFA", "#F472B6",
  "#38BDF8", "#4ADE80", "#C084FC", "#FB923C",
  "#2DD4BF", "#E879F9",
];

export default function App() {
  const app = useSpinnerApp();

  const activeTasks = app.tasks.filter(
    (t) =>
      t.active &&
      !app.roundState.completedTaskIdsThisRound.includes(t.id) &&
      !app.roundState.skippedTaskIdsThisRound.includes(t.id)
  ).length;
  const completedTasks = app.roundState.completedTaskIdsThisRound.length;

  const pendingSplitTaskId = app.roundState.pendingSplitTaskId ?? null;
  const activeTaskId = app.roundState.activeTaskId ?? null;
  const spinBlockReason = activeTaskId
    ? "请先完成当前任务后再转动"
    : pendingSplitTaskId
    ? "请先完成任务拆解后再转动"
    : app.hasBlockingSubtasks
    ? "请先完成所有子任务后再转动（勾选任务列表中的子任务）"
    : undefined;
  const canSpin =
    app.wheelSegments.length > 0 &&
    !app.isSpinning &&
    !activeTaskId &&
    !pendingSplitTaskId &&
    !app.hasBlockingSubtasks;

  // Skip-card stats line (shown below the spin button)
  const skipCardProgressLine =
    app.skipCardsLeft >= 3
      ? "🃏 跳过卷: 3/3（已满）"
      : `🃏 跳过卷: ${app.skipCardsLeft}/3  再完成 ${3 - app.skipCardProgress} 个任务得 1 张`;

  return (
    <div className="app-container">
      {/* ── Left: Wheel ── */}
      <SpinnerWheel
        segments={app.wheelSegments}
        isSpinning={app.isSpinning}
        canSpin={canSpin}
        targetRotation={app.targetRotation}
        statsLine={`${activeTasks} 个任务待完成 · ${completedTasks} 个已完成`}
        skipCardsLine={skipCardProgressLine}
        blockReason={spinBlockReason}
        onSpin={app.spin}
        onSpinComplete={app.onSpinComplete}
      />

      {/* ── Right: Control Panel ── */}
      <div className="control-section">
        {/* Round Progress */}
        {app.statsVM && (
          <RoundProgressPanel vm={app.statsVM} onReset={app.resetRound} />
        )}

        {/* Rewards */}
        <RewardBank
          vm={app.rewardBankVM}
          onEditReward={app.openRewardEdit}
          onUseBanked={app.useBankedReward}
        />

        {/* Tasks */}
        <div className="panel tasks-panel">
          <div className="panel-header">
            <h2>📋 学习任务</h2>
            <div className="panel-header-actions">
              <button
                id="bulk-import-btn"
                className="add-btn-secondary"
                onClick={app.openBulkImport}
              >
                批量导入
              </button>
              <button
                id="add-task-btn"
                className="add-btn"
                onClick={() => app.openTaskEdit(null)}
              >
                ＋ 添加
              </button>
            </div>
          </div>
          <div id="tasks-list" className="items-list">
            {app.tasks.length === 0 ? (
              <div className="empty-state">还没有任务，点击"添加任务"开始吧！</div>
            ) : (
              app.taskListItems.map((item, i) => (
                <div
                  key={item.id}
                  className={`task-item ${item.isCompleted ? "completed" : ""} ${item.isInactive ? "inactive" : ""}`}
                  data-id={item.id}
                >
                  <div
                    className={`task-checkbox ${item.isCompleted ? "checked" : ""}`}
                    data-toggle={item.id}
                    onClick={() => app.toggleTask(item.id)}
                  >
                    {item.isCompleted ? "✓" : ""}
                  </div>
                  <div
                    className="task-dot"
                    style={{ background: TASK_COLORS[i % TASK_COLORS.length] }}
                  />
                  <div className="task-info">
                    <span className="task-name">{item.title}</span>
                    <span className="task-meta">
                      <span
                        className="task-tag"
                        style={{ color: item.difficultyColor }}
                      >
                        {item.difficultyLabel}
                      </span>
                      <span className="task-tag">{item.categoryLabel}</span>
                      <span className="task-tag">{item.estimatedMinutes}分</span>
                      {item.isOneTime && (
                        <span className="task-tag once-tag">一次性</span>
                      )}
                    </span>
                  </div>
                  <div className="task-actions">
                    <button
                      className="icon-btn"
                      data-edit={item.id}
                      title="编辑"
                      onClick={(e) => {
                        e.stopPropagation();
                        app.openTaskEdit(item.id);
                      }}
                    >
                      ✏️
                    </button>
                    <button
                      className="icon-btn delete"
                      data-del={item.id}
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        app.deleteTask(item.id);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stats */}
        {app.statsVM && <StatsPanel vm={app.statsVM} />}

        {/* Rules */}
        <div className="panel">
          <div className="panel-header">
            <h2>📖 规则说明</h2>
            <button
              id="rules-toggle-btn"
              className="toggle-btn"
              onClick={app.toggleRules}
            >
              {app.rulesOpen ? "▼" : "▶"}
            </button>
          </div>
          <div id="rules-body" className={app.rulesOpen ? "" : "hidden"}>
            <ul className="rules-list">
              <li>
                任务占转盘 <strong>90%</strong> 概率，奖励占 <strong>10%</strong>
              </li>
              <li>
                转到结果后必须立即选择，<strong>没有"稍后"选项</strong>
              </li>
              <li>
                点「拖延了」下次转盘<strong>简单任务概率更高</strong>
              </li>
              <li>
                中等/困难任务可<strong>拆分为小任务</strong>
              </li>
              <li>
                每周自动重置 <strong>2 张跳过卡</strong>
              </li>
              <li>
                奖励可<strong>存入奖励库</strong>留待以后使用
              </li>
              <li>
                「重置本轮」只重置<strong>重复性任务</strong>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <SpinResultModal
        winnerId={app.currentWinnerId}
        winnerType={app.currentWinnerType}
        tasks={app.tasks}
        rewards={app.rewards}
        skipCardsLeft={app.skipCardsLeft}
        skipCardProgress={app.skipCardProgress}
        consecutiveSkips={app.consecutiveSkips}
        onCompleteTask={app.completeTask}
        onProcrastinateTask={app.procrastinateTask}
        onSkipTask={app.skipTask}
        onUseRewardNow={app.useRewardNow}
        onBankReward={app.bankReward}
      />

      <TaskEditor
        isOpen={app.taskEditOpen}
        task={app.taskBeingEdited}
        onClose={app.closeTaskEdit}
        onSave={app.saveTaskEdit}
      />

      <RewardEditor
        isOpen={app.rewardEditOpen}
        reward={app.rewardBeingEdited}
        onClose={app.closeRewardEdit}
        onSave={app.saveRewardEdit}
      />

      <SplitTaskModal
        isOpen={app.splitOpen}
        task={app.taskBeingSplit}
        splitState={app.splitState}
        aiSubtasks={app.aiSubtasks}
        errorMsg={app.splitErrorMsg}
        onRequestAi={app.requestAiSplit}
        onAcceptAi={app.acceptAiSplit}
        onRejectAi={app.rejectAiSplit}
        onConfirmManual={app.confirmManualSplit}
        onCancel={app.cancelSplit}
      />

      <BulkImportModal
        isOpen={app.bulkImportOpen}
        onClose={app.closeBulkImport}
        onImport={app.confirmBulkImport}
      />
    </div>
  );
}
