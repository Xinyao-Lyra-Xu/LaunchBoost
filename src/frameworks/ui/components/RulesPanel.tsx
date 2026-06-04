import { useState, type ReactNode } from "react";

interface Rule {
  /** The rule line itself (may contain <strong> emphasis). */
  label: ReactNode;
  /** Grey small-print: the science behind the rule. */
  note: string;
}

const RULES: Rule[] = [
  {
    label: (
      <>
        任务占转盘 <strong>90%</strong> 概率，奖励占 <strong>10%</strong>
      </>
    ),
    note: "变比强化原理——不可预期的奖励比固定奖励更能维持行为（Skinner, 1957）。稀疏奖励让每次转动都有期待感。",
  },
  {
    label: (
      <>
        转到结果后必须立即选择，<strong>没有"稍后"选项</strong>
      </>
    ),
    note: "避免决策回避——选项搁置会触发「稍后再说」的拖延循环。强制即时选择切断了犹豫的入口（Ariely & Wertenbroch, 2002）。",
  },
  {
    label: (
      <>
        点「拖延了」下次转盘<strong>简单任务概率更高</strong>
      </>
    ),
    note: "自我效能重建——Bandura（1997）证明，小胜利是恢复信心最快的路径。先赢一次，再挑战难的。",
  },
  {
    label: (
      <>
        中等/困难任务可<strong>拆分为小任务</strong>
      </>
    ),
    note: "任务粒度效应——超过 20–25 分钟的任务会激活大脑的「威胁评估」，前额叶退出，拖延启动。拆小后重新接管（Pychyl, 2013）。",
  },
  {
    label: (
      <>
        每周自动重置 <strong>2 张跳过卡</strong>
      </>
    ),
    note: "心理账户——Thaler（1985）发现，人对「赚来的权益」比「随意权限」更谨慎使用。卡是劳动兑换的，不是免费的退出键。",
  },
  {
    label: (
      <>
        奖励可<strong>存入奖励库</strong>留待以后使用
      </>
    ),
    note: "延迟满足的自主性——强迫立即享用奖励反而破坏自主感。允许存入库，满足自我决定理论中的「自主需求」（Deci & Ryan, 2000）。",
  },
  {
    label: (
      <>
        「重置本轮」只重置<strong>重复性任务</strong>
      </>
    ),
    note: "习惯回路维持——一次性任务完成后不复位，保留真实进度感。进度可见性是维持长期动机的关键（Amabile & Kramer, 2011）。",
  },
];

interface Props {
  isOpen: boolean;
  onToggle(): void;
  /** Reopen the "why the wheel works" onboarding modal. */
  onShowWhy(): void;
}

export function RulesPanel({ isOpen, onToggle, onShowWhy }: Props) {
  // Track which rules have their science note expanded (collapsed by default
  // to avoid information overload — user expands via the ⓘ icon).
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleNote = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>📖 规则说明</h2>
        <div className="panel-header-actions">
          <button className="add-btn-secondary" onClick={onShowWhy}>
            为什么有效？
          </button>
          <button id="rules-toggle-btn" className="toggle-btn" onClick={onToggle}>
            {isOpen ? "▼" : "▶"}
          </button>
        </div>
      </div>
      <div id="rules-body" className={isOpen ? "" : "hidden"}>
        <ul className="rules-list">
          {RULES.map((rule, i) => {
            const isNoteOpen = expanded.has(i);
            return (
              <li key={i} className="rule-item">
                <div className="rule-line">
                  <span className="rule-text">{rule.label}</span>
                  <button
                    className={`rule-info-btn ${isNoteOpen ? "active" : ""}`}
                    title="为什么这样设计？"
                    aria-expanded={isNoteOpen}
                    onClick={() => toggleNote(i)}
                  >
                    ⓘ
                  </button>
                </div>
                {isNoteOpen && <p className="rule-note">{rule.note}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
