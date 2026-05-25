// ── Constants ──────────────────────────────────────────────────────────────
const REWARD_COLORS = ['#FBBF24', '#F97316', '#F87171'];
const TASK_COLORS = [
  '#60A5FA', '#34D399', '#A78BFA', '#F472B6',
  '#38BDF8', '#4ADE80', '#C084FC', '#FB923C',
  '#2DD4BF', '#E879F9'
];
const CATEGORY_LABELS  = { study: '学习', life: '生活', health: '健康', project: '项目' };
const DIFFICULTY_LABELS = { easy: '简单', medium: '中等', hard: '困难' };

// ── Canvas Setup ───────────────────────────────────────────────────────────
const canvas = document.getElementById('wheel-canvas');
const ctx = canvas.getContext('2d');
const DPR = window.devicePixelRatio || 1;
const DISPLAY = 390;
canvas.width  = DISPLAY * DPR;
canvas.height = DISPLAY * DPR;
canvas.style.width  = `${DISPLAY}px`;
canvas.style.height = `${DISPLAY}px`;
ctx.scale(DPR, DPR);
const CENTER = DISPLAY / 2;
const RADIUS = CENTER - 6;

// ── State ──────────────────────────────────────────────────────────────────
let data = { rewards: [], tasks: [], meta: {} };
let totalRotation        = 0;
let isSpinning           = false;
let currentResult        = null;
let editContext          = null;
let nextId               = 1;
let afterProcrastination  = false;
let splitTaskTarget       = null;
let aiGeneratedSubtasks   = null;

// ── Timer State ────────────────────────────────────────────────────────────
let timerInterval = null;
let timerSeconds  = 0;
let timerMode     = 'idle'; // 'idle' | 'up' | 'down'
let timerEstMins  = 15;

// ── Chain & Stats State ────────────────────────────────────────────────────
let currentChain = null;   // TaskChain currently being worked through
let statsTab     = 'today'; // 'today' | 'week' | 'month'

// ── Migration ──────────────────────────────────────────────────────────────
function migrateTask(t) {
  const wasCompleted = t.completed || false;
  return {
    id:                  t.id,
    title:               t.title || t.name || '未命名任务',
    category:            t.category            || 'study',
    difficulty:          t.difficulty          || 'easy',
    estimatedMinutes:    t.estimatedMinutes     || 15,
    weight:              t.weight              || 2,
    repeatable:          t.repeatable !== undefined ? t.repeatable : true,
    frequency:           t.frequency           || 'custom',
    completed:           wasCompleted,
    completedCount:      t.completedCount      || 0,
    procrastinatedCount: t.procrastinatedCount || 0,
    skippedCount:        t.skippedCount        || 0,
    activeInCurrentRound: t.activeInCurrentRound !== undefined
      ? t.activeInCurrentRound : !wasCompleted,
    parentTaskId:    t.parentTaskId    || null,
    parentTaskTitle: t.parentTaskTitle || null,
    isSubtask:       t.isSubtask       || false,
    subtaskOrder:    t.subtaskOrder    || 0,
    chainId:         t.chainId         || null
  };
}

function migrateReward(r, i) {
  return {
    id:              r.id   !== undefined ? r.id : (i + 1),
    title:           r.title || r.name   || '未命名奖励',
    durationMinutes: r.durationMinutes   || 30,
    weight:          r.weight            || 1,
    banked:          r.banked            || 0,
    active:          r.active !== undefined ? r.active : true
  };
}

function migrateStats(raw) {
  const todayKey = getTodayKey();
  const s = raw || {};
  const base = {
    totalCompleted:      s.totalCompleted      || 0,
    totalProcrastinated: s.totalProcrastinated || 0,
    totalSkipped:        s.totalSkipped        || 0,
    totalRewardsBanked:  s.totalRewardsBanked  || 0
  };
  if (s.todayKey !== todayKey) {
    return { todayKey, completedToday: 0, procrastinatedToday: 0,
             skippedToday: 0, rewardsBankedToday: 0, ...base };
  }
  return {
    todayKey,
    completedToday:      s.completedToday      || 0,
    procrastinatedToday: s.procrastinatedToday || 0,
    skippedToday:        s.skippedToday        || 0,
    rewardsBankedToday:  s.rewardsBankedToday  || 0,
    ...base
  };
}

// ── Init ───────────────────────────────────────────────────────────────────
function getWeekKey() {
  const d    = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function init() {
  const raw = await window.api.loadData();
  data = {
    rewards: (Array.isArray(raw.rewards) ? raw.rewards : []).map(migrateReward),
    tasks:   (Array.isArray(raw.tasks)   ? raw.tasks   : []).map(migrateTask),
    meta:    (raw.meta && typeof raw.meta === 'object') ? raw.meta : {}
  };

  const wk = getWeekKey();
  if (!data.meta.skipCards || data.meta.skipCards.weekKey !== wk) {
    data.meta.skipCards = { count: 2, weekKey: wk };
  }

  data.meta.stats = migrateStats(data.meta.stats);

  if (!Array.isArray(data.meta.chains))      data.meta.chains      = [];
  if (!Array.isArray(data.meta.activityLog)) data.meta.activityLog = [];
  if (data.meta.lockedByTaskId     === undefined) data.meta.lockedByTaskId     = null;
  if (data.meta.pendingTaskResultId === undefined) data.meta.pendingTaskResultId = null;
  // Defensive: if the pending task is already done, clear stale lock
  if (data.meta.pendingTaskResultId) {
    const pTask = data.tasks.find(t => String(t.id) === String(data.meta.pendingTaskResultId));
    if (!pTask || pTask.completed) data.meta.pendingTaskResultId = null;
  }
  currentChain = data.meta.chains.find(c => c.status === 'active') || null;

  // Restore lock: if there was a procrastination with no chain created (e.g. refresh mid-split)
  if (data.meta.lockedByTaskId && !currentChain) {
    const lockedTask = data.tasks.find(t => String(t.id) === String(data.meta.lockedByTaskId));
    setTimeout(() => {
      if (lockedTask) {
        openSplitModal(lockedTask);
      } else {
        data.meta.lockedByTaskId = null;
        saveData();
        updateSpinLock();
      }
    }, 100);
  }

  nextId = Math.max(
    0,
    ...data.tasks.map(t   => t.id || 0),
    ...data.rewards.map(r => r.id || 0)
  ) + 1;

  renderAll();
}

function renderAll() {
  drawWheel();
  renderRewards();
  renderTasks();
  renderRoundProgress();
  renderStats();
  updateStats();
  updateChainBanner();
  updateSpinLock();
}

// ── Wheel Drawing ──────────────────────────────────────────────────────────
function getActiveSegments() {
  const activeTasks = data.tasks.filter(t => t.activeInCurrentRound && !t.completed);
  const rewards     = data.rewards.filter(r => r.active !== false);
  const segs        = [];

  if (activeTasks.length === 0 && rewards.length === 0) return segs;

  const hasTasks   = activeTasks.length > 0;
  const hasRewards = rewards.length > 0;

  if (hasTasks && hasRewards) {
    const SCALE          = 1000;
    const rewardRawTotal = rewards.reduce((s, r) => s + (r.weight || 1), 0);
    rewards.forEach((r, i) => {
      const w = ((r.weight || 1) / rewardRawTotal) * 0.1 * SCALE;
      segs.push({ type: 'reward', item: r, color: REWARD_COLORS[i % REWARD_COLORS.length], weight: w });
    });
    const taskEffTotal = activeTasks.reduce((s, t) => s + getTaskEffWeight(t), 0);
    activeTasks.forEach(t => {
      const idx = data.tasks.findIndex(x => x.id === t.id) % TASK_COLORS.length;
      const w   = (getTaskEffWeight(t) / taskEffTotal) * 0.9 * SCALE;
      segs.push({ type: 'task', item: t, color: TASK_COLORS[idx], weight: w });
    });
  } else if (hasTasks) {
    const taskEffTotal = activeTasks.reduce((s, t) => s + getTaskEffWeight(t), 0);
    activeTasks.forEach(t => {
      const idx = data.tasks.findIndex(x => x.id === t.id) % TASK_COLORS.length;
      segs.push({ type: 'task', item: t, color: TASK_COLORS[idx], weight: getTaskEffWeight(t) });
    });
  } else {
    rewards.forEach((r, i) => {
      segs.push({ type: 'reward', item: r, color: REWARD_COLORS[i % REWARD_COLORS.length], weight: r.weight || 1 });
    });
  }
  return segs;
}

function getTaskEffWeight(t) {
  const base = t.weight || 2;
  if (!afterProcrastination) return base;
  const mult = { easy: 2, medium: 1.2, hard: 0.7 };
  return base * (mult[t.difficulty] || 1);
}

function drawWheel() {
  ctx.clearRect(0, 0, DISPLAY, DISPLAY);
  const segs = getActiveSegments();

  if (segs.length === 0) { drawEmptyWheel(); return; }

  const totalWeight = segs.reduce((s, seg) => s + seg.weight, 0);
  let angle = -Math.PI / 2;

  segs.forEach((seg, i) => {
    const arc = (seg.weight / totalWeight) * Math.PI * 2;
    const end = angle + arc;
    const mid = angle + arc / 2;

    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, RADIUS, angle, end);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? seg.color : darken(seg.color, 18);
    ctx.fill();

    ctx.strokeStyle = 'rgba(10, 10, 30, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    drawText(seg.item.title || seg.item.name || '', mid, seg.type === 'reward', arc);
    angle = end;
  });

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#12122a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
}

function drawEmptyWheel() {
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2a48';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('请添加任务', CENTER, CENTER);
  ctx.textBaseline = 'alphabetic';
}

function drawText(text, midAngle, isReward, arcAngle) {
  const MIN_ARC = Math.PI / 9;

  ctx.save();
  ctx.translate(CENTER, CENTER);
  ctx.rotate(midAngle);

  const norm = ((midAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const flip = norm > Math.PI / 2 && norm < Math.PI * 3 / 2;

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 3;

  if (arcAngle < MIN_ARC) {
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('·', flip ? -(RADIUS * 0.62) : RADIUS * 0.62, 4);
  } else {
    const fontSize = arcAngle > Math.PI / 4 ? 13 : 12;
    ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
    const maxW  = RADIUS * 0.62;
    const label = (isReward ? '⭐ ' : '') + text;
    if (flip) {
      ctx.rotate(Math.PI);
      ctx.textAlign = 'right';
      ctx.fillText(label, -28, 5, maxW);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(label, 28, 5, maxW);
    }
  }
  ctx.restore();
}

function darken(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}

function lighten(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `rgb(${r},${g},${b})`;
}

// ── Flash highlight ────────────────────────────────────────────────────────
function flashWinnerSegment(winnerSeg, segs, callback) {
  let tick = 0;
  const TOTAL = 6; // 3 on + 3 off

  function next() {
    tick++;
    drawWheelHighlighted(winnerSeg, segs, tick % 2 === 1);
    if (tick < TOTAL) {
      setTimeout(next, 220);
    } else {
      drawWheel();
      callback();
    }
  }
  setTimeout(next, 80);
}

function drawWheelHighlighted(winnerSeg, segs, highlight) {
  ctx.clearRect(0, 0, DISPLAY, DISPLAY);
  const totalWeight = segs.reduce((s, seg) => s + seg.weight, 0);
  let angle = -Math.PI / 2;

  segs.forEach((seg, i) => {
    const arc = (seg.weight / totalWeight) * Math.PI * 2;
    const end = angle + arc;
    const mid = angle + arc / 2;
    const isWinner = seg === winnerSeg;

    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, RADIUS, angle, end);
    ctx.closePath();

    ctx.fillStyle = (isWinner && highlight)
      ? lighten(seg.color, 70)
      : (i % 2 === 0 ? seg.color : darken(seg.color, 18));
    ctx.fill();

    if (isWinner && highlight) {
      ctx.strokeStyle = 'rgba(255, 255, 100, 0.95)';
      ctx.lineWidth = 5;
      ctx.shadowColor = 'rgba(255, 230, 0, 0.9)';
      ctx.shadowBlur = 18;
    } else {
      ctx.strokeStyle = 'rgba(10, 10, 30, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawText(seg.item.title || seg.item.name || '', mid, seg.type === 'reward', arc);
    angle = end;
  });

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#12122a';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();
}

// ── Spin ───────────────────────────────────────────────────────────────────
document.getElementById('spin-btn').addEventListener('click', spin);

function pickWinner(segs) {
  const totalWeight = segs.reduce((s, seg) => s + seg.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const seg of segs) {
    rand -= seg.weight;
    if (rand < 0) return seg;
  }
  return segs[segs.length - 1];
}

function spin() {
  if (isSpinning) return;
  if ((currentChain && currentChain.status === 'active') || data.meta.lockedByTaskId) return;
  const segs = getActiveSegments();
  if (segs.length === 0) return;

  isSpinning = true;
  document.getElementById('spin-btn').disabled = true;

  const winner = pickWinner(segs);

  const totalWeight = segs.reduce((s, seg) => s + seg.weight, 0);
  let segStart = 0;
  let centerDeg = 0;
  for (const seg of segs) {
    const arcDeg = (seg.weight / totalWeight) * 360;
    if (seg === winner) { centerDeg = segStart + arcDeg / 2; break; }
    segStart += arcDeg;
  }

  const targetMod  = (360 - centerDeg) % 360;
  const currentMod = totalRotation % 360;
  const delta      = (targetMod - currentMod + 360) % 360;
  const fullSpins  = (5 + Math.floor(Math.random() * 4)) * 360;
  totalRotation   += fullSpins + delta;

  canvas.style.transform = `rotate(${totalRotation}deg)`;

  setTimeout(() => {
    const norm = totalRotation % 360;
    canvas.style.transition = 'none';
    canvas.style.transform  = `rotate(${norm}deg)`;
    totalRotation = norm;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      canvas.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    }));

    afterProcrastination = false;
    isSpinning = false;
    flashWinnerSegment(winner, segs, () => {
      // Rewards resolve immediately; task results stay locked until the user acts
      if (winner.type === 'reward') document.getElementById('spin-btn').disabled = false;
      showResult(winner);
    });
  }, 4150);
}

// ── Result Modal ───────────────────────────────────────────────────────────
function showResult(winner) {
  currentResult = winner;
  const content = document.getElementById('modal-content');
  content.className = 'modal-content';

  if (winner.type === 'reward') {
    content.classList.add('reward-result');
    document.getElementById('modal-emoji').textContent = '🎉';
    document.getElementById('modal-type').textContent  = '✨ 获得奖励';
    document.getElementById('modal-title').textContent = winner.item.title;
    const dur = winner.item.durationMinutes || 30;
    document.getElementById('modal-desc').textContent  = `享受 ${dur} 分钟的奖励时间！`;
    document.getElementById('modal-actions').innerHTML = `
      <button class="btn-complete" id="use-now-btn">立即使用 ✓</button>
      <button class="btn-bank" id="bank-reward-btn">存入奖励库 🏦</button>
    `;
    document.getElementById('use-now-btn').addEventListener('click', useRewardNow);
    document.getElementById('bank-reward-btn').addEventListener('click', bankCurrentReward);
  } else {
    content.classList.add('task-result');
    const parentCtx = document.getElementById('modal-parent-ctx');
    if (winner.item.isSubtask && winner.item.parentTaskTitle) {
      parentCtx.textContent = '父任务：' + winner.item.parentTaskTitle;
      parentCtx.classList.remove('hidden');
    } else {
      parentCtx.classList.add('hidden');
    }
    const skipCount  = data.meta && data.meta.skipCards ? data.meta.skipCards.count : 0;
    const catLabel   = CATEGORY_LABELS[winner.item.category]  || winner.item.category  || '';
    const diffLabel  = DIFFICULTY_LABELS[winner.item.difficulty] || winner.item.difficulty || '';
    const mins       = winner.item.estimatedMinutes || 15;
    document.getElementById('modal-emoji').textContent = '📚';
    document.getElementById('modal-type').textContent  = `${catLabel}  ·  ${diffLabel}  ·  ${mins} 分钟`;
    document.getElementById('modal-title').textContent = winner.item.title;
    document.getElementById('modal-desc').textContent  = '加油！完成这个任务，你会离目标更近一步！';
    document.getElementById('modal-actions').innerHTML = `
      <button class="btn-complete"     id="complete-task-btn">完成 ✓</button>
      <button class="btn-procrastinate" id="procrastinate-btn">太难了，帮我拆小 ✂️</button>
      <button class="btn-skip" id="skip-card-btn" ${skipCount === 0 ? 'disabled' : ''}>使用跳过卡 🃏 (${skipCount})</button>
    `;
    document.getElementById('complete-task-btn').addEventListener('click', completeCurrentTask);
    document.getElementById('procrastinate-btn').addEventListener('click', procrastinateCurrentTask);
    document.getElementById('skip-card-btn').addEventListener('click', skipCurrentTask);
  }
  const timerEl = document.getElementById('modal-timer');
  if (winner.type === 'task') {
    timerEl.classList.remove('hidden');
    initTimer(winner.item.estimatedMinutes || 15);
    // Persist lock so page refresh still remembers the unresolved task
    data.meta.pendingTaskResultId = String(winner.item.id);
    saveData();
    updateSpinLock();
  } else {
    timerEl.classList.add('hidden');
  }
  document.getElementById('result-modal').classList.remove('hidden');
}

function closeResult() {
  stopTimer(true);
  document.getElementById('result-modal').classList.add('hidden');
  currentResult = null;
}

// ── Task result actions ────────────────────────────────────────────────────
function completeCurrentTask() {
  if (!currentResult || currentResult.type !== 'task') return;
  const task = data.tasks.find(t => t.id === currentResult.item.id);
  if (task) {
    task.completed            = true;
    task.completedCount       = (task.completedCount || 0) + 1;
    task.activeInCurrentRound = false;
  }
  data.meta.pendingTaskResultId = null; // task resolved — unlock spin
  saveData();
  renderAll(); // updateSpinLock() inside will re-enable spin button
  bumpStat('completedToday', 'totalCompleted');
  logActivity('task_done', {
    taskId: String(currentResult.item.id), taskTitle: currentResult.item.title,
    parentTaskId: currentResult.item.parentTaskId || null,
    parentTaskTitle: currentResult.item.parentTaskTitle || null,
    category: currentResult.item.category,
    estimatedMinutes: currentResult.item.estimatedMinutes || 15
  });
  closeResult();
  showToast('任务完成！继续加油 🎉');
}

function procrastinateCurrentTask() {
  if (!currentResult || currentResult.type !== 'task') return;
  const task = data.tasks.find(t => t.id === currentResult.item.id);
  if (task) {
    task.procrastinatedCount = (task.procrastinatedCount || 0) + 1;
  }
  bumpStat('procrastinatedToday', 'totalProcrastinated');
  logActivity('task_procrastinated', {
    taskId: String(currentResult.item.id), taskTitle: currentResult.item.title,
    category: currentResult.item.category
  });
  // Lock spin — user must complete a task chain before spinning again
  data.meta.pendingTaskResultId = null; // transitions to lockedByTaskId
  data.meta.lockedByTaskId      = String(currentResult.item.id);
  saveData();
  closeResult();
  openSplitModal(task || currentResult.item);
}

function skipCurrentTask() {
  if (!currentResult || currentResult.type !== 'task') return;
  if (!data.meta.skipCards || data.meta.skipCards.count <= 0) return;
  data.meta.skipCards.count--;
  data.meta.pendingTaskResultId = null; // skip card resolves the result — unlock spin
  const task = data.tasks.find(t => t.id === currentResult.item.id);
  if (task) {
    task.skippedCount = (task.skippedCount || 0) + 1;
    // Task remains activeInCurrentRound — skip card does not permanently remove it
  }
  bumpStat('skippedToday', 'totalSkipped');
  logActivity('task_skipped', {
    taskId: String(currentResult.item.id), taskTitle: currentResult.item.title,
    category: currentResult.item.category
  });
  saveData();
  renderAll(); // updateSpinLock() inside will re-enable spin button
  const remaining = data.meta.skipCards.count;
  closeResult();
  showToast(`任务已跳过！还剩 ${remaining} 张跳过卡 🃏`);
}

// ── Reward result actions ──────────────────────────────────────────────────
function useRewardNow() {
  const item = currentResult ? currentResult.item : null;
  closeResult();
  if (item) logActivity('reward_used', { rewardId: String(item.id), rewardTitle: item.title });
  showToast('享受你的奖励吧！🎉');
}

function bankCurrentReward() {
  if (!currentResult || currentResult.type !== 'reward') return;
  const reward = data.rewards.find(r => r.id === currentResult.item.id);
  if (reward) {
    reward.banked = (reward.banked || 0) + 1;
    saveData();
    renderAll();
  }
  bumpStat('rewardsBankedToday', 'totalRewardsBanked');
  logActivity('reward_banked', { rewardId: String(reward.id), rewardTitle: reward.title });
  closeResult();
  showToast('奖励已存入奖励库！🏦');
}

function useBankedReward(id) {
  const r = data.rewards.find(r => r.id === id);
  if (r && r.banked > 0) {
    r.banked--;
    saveData();
    renderAll();
    showToast(`享受 "${r.title}" 吧！🎉`);
  }
}

// ── ID + Activity Log ──────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function logActivity(action, details) {
  if (!data.meta.activityLog) data.meta.activityLog = [];
  data.meta.activityLog.push({ id: generateId(), timestamp: new Date().toISOString(), action, ...details });
}

// ── Timer ──────────────────────────────────────────────────────────────────
function initTimer(estimatedMinutes) {
  stopTimer(true);
  timerEstMins = estimatedMinutes || 15;
  timerSeconds = 0;
  timerMode    = 'idle';
  document.getElementById('timer-est-input').value = timerEstMins;
  document.getElementById('timer-display').textContent = '00:00';
  document.getElementById('timer-result').className = 'timer-result hidden';
  document.getElementById('timer-result').textContent = '';
  document.getElementById('timer-up-btn').classList.remove('hidden');
  document.getElementById('timer-down-btn').classList.remove('hidden');
  document.getElementById('timer-stop-btn').classList.add('hidden');
}

function startTimerUp() {
  stopTimer(true);
  timerMode    = 'up';
  timerSeconds = 0;
  document.getElementById('timer-up-btn').classList.add('hidden');
  document.getElementById('timer-down-btn').classList.add('hidden');
  document.getElementById('timer-stop-btn').classList.remove('hidden');
  document.getElementById('timer-result').className = 'timer-result hidden';
  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function startTimerDown() {
  stopTimer(true);
  timerEstMins  = parseInt(document.getElementById('timer-est-input').value) || 15;
  timerMode     = 'down';
  timerSeconds  = timerEstMins * 60;
  document.getElementById('timer-up-btn').classList.add('hidden');
  document.getElementById('timer-down-btn').classList.add('hidden');
  document.getElementById('timer-stop-btn').classList.remove('hidden');
  document.getElementById('timer-result').className = 'timer-result hidden';
  timerInterval = setInterval(() => {
    timerSeconds = Math.max(0, timerSeconds - 1);
    updateTimerDisplay();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      timerMode = 'idle';
      document.getElementById('timer-up-btn').classList.remove('hidden');
      document.getElementById('timer-down-btn').classList.remove('hidden');
      document.getElementById('timer-stop-btn').classList.add('hidden');
      showTimerCompare(timerEstMins * 60);
    }
  }, 1000);
}

function stopTimer(silent) {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (!silent && timerMode !== 'idle') {
    const prevMode = timerMode;
    const elapsed  = prevMode === 'up' ? timerSeconds : (timerEstMins * 60 - timerSeconds);
    timerMode = 'idle';
    document.getElementById('timer-up-btn').classList.remove('hidden');
    document.getElementById('timer-down-btn').classList.remove('hidden');
    document.getElementById('timer-stop-btn').classList.add('hidden');
    showTimerCompare(elapsed);
  } else {
    timerMode = 'idle';
  }
}

function updateTimerDisplay() {
  const secs = Math.abs(timerSeconds);
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

function showTimerCompare(elapsedSeconds) {
  const estSecs    = timerEstMins * 60;
  const diff       = elapsedSeconds - estSecs;
  const absDiffMin = Math.round(Math.abs(diff) / 60);
  const actualMin  = Math.round(elapsedSeconds / 60);
  const el         = document.getElementById('timer-result');

  let msg, cls;
  if (Math.abs(diff) <= 300) {
    msg = `✅ 完美！用时 ${actualMin} 分钟，与预估相差不超过 5 分钟`;
    cls = 'timer-result timer-ok';
  } else if (diff > 0) {
    msg = `⏰ 超时了 ${absDiffMin} 分钟（用时 ${actualMin} 分，预估 ${timerEstMins} 分）`;
    cls = 'timer-result timer-over';
  } else {
    msg = `⚡ 提前完成！节省了 ${absDiffMin} 分钟（用时 ${actualMin} 分，预估 ${timerEstMins} 分）`;
    cls = 'timer-result timer-under';
  }
  el.textContent = msg;
  el.className = cls;
}

document.getElementById('timer-up-btn').addEventListener('click', startTimerUp);
document.getElementById('timer-down-btn').addEventListener('click', startTimerDown);
document.getElementById('timer-stop-btn').addEventListener('click', () => stopTimer(false));
document.getElementById('timer-est-input').addEventListener('change', () => {
  timerEstMins = parseInt(document.getElementById('timer-est-input').value) || 15;
});

// ── Split Modal ────────────────────────────────────────────────────────────
// States: 'choice' | 'loading' | 'results' | 'error' | 'manual'

function openSplitModal(task) {
  splitTaskTarget     = task;
  aiGeneratedSubtasks = null;
  const isLocked = !!data.meta.lockedByTaskId;
  // Update description text
  const descEl = document.getElementById('split-desc-p');
  if (descEl) {
    if (isLocked) {
      descEl.textContent = '这个任务不能直接跳过。你需要把它拆成更小的步骤，完成后才能继续抽取。';
    } else {
      descEl.innerHTML = '任务 "<span id="split-task-name">' + esc(task ? task.title : '') + '</span>" 有点难，要拆分成更小的步骤吗？';
    }
  }
  const nameEl = document.getElementById('split-task-name');
  if (nameEl) nameEl.textContent = task ? task.title : '';
  // Hide "不拆分" when forced — user cannot escape without creating a chain
  const noBtn = document.getElementById('split-no-btn');
  if (noBtn) noBtn.style.display = isLocked ? 'none' : '';
  setSplitState('choice');
  document.getElementById('split-modal').classList.remove('hidden');
}

function setSplitState(state) {
  document.getElementById('split-state-choice').style.display  = state === 'choice'  ? '' : 'none';
  document.getElementById('split-state-loading').style.display = state === 'loading' ? '' : 'none';
  document.getElementById('split-state-results').style.display = state === 'results' ? '' : 'none';
  document.getElementById('split-state-error').style.display   = state === 'error'   ? '' : 'none';
  document.getElementById('split-state-manual').style.display  = state === 'manual'  ? '' : 'none';
}

const TASK_TYPE_LABELS = {
  review: '复习', vocab: '背单词', problem: '做题', code: '写代码',
  assignment: '写作业', organize: '整理', email: '发邮件', generic: '一般任务'
};

async function requestAiSplit() {
  if (!splitTaskTarget) return;
  setSplitState('loading');
  try {
    const result = await window.api.splitTask({
      title:            splitTaskTarget.title,
      category:         splitTaskTarget.category    || 'study',
      difficulty:       splitTaskTarget.difficulty  || 'easy',
      estimatedMinutes: splitTaskTarget.estimatedMinutes || 15
    });
    if (result.error) {
      document.getElementById('split-error-msg').textContent = result.error;
      setSplitState('error');
    } else {
      aiGeneratedSubtasks = result.subtasks;
      renderSplitResults(result, result.source || 'local');
      setSplitState('results');
    }
  } catch (e) {
    document.getElementById('split-error-msg').textContent = e.message || '请求失败';
    setSplitState('error');
  }
}

function renderSplitResults(splitResult, source) {
  // Source badge
  const labelEl = document.getElementById('split-source-label');
  if (labelEl) {
    if (source === 'ai') {
      labelEl.textContent = '🤖 AI 智能拆分';
      labelEl.className = 'split-source-label split-source-ai';
    } else {
      labelEl.textContent = '📋 本地规则拆分';
      labelEl.className = 'split-source-label split-source-local';
    }
  }

  // Detection info
  const detEl = document.getElementById('split-detection');
  if (detEl) {
    const typeLabel = TASK_TYPE_LABELS[splitResult.taskType] || splitResult.taskType || '';
    const targetStr = splitResult.target || '';
    detEl.innerHTML = typeLabel
      ? '<span class="split-detect-type">' + esc(typeLabel) + '</span>'
        + (targetStr ? '<span class="split-detect-sep"> · </span>'
          + '<span class="split-detect-target">' + esc(targetStr) + '</span>'
          : '')
      : '';
  }

  // Hide "Add to Spinner" when forced — must start chain
  const spinnerBtn = document.getElementById('split-spinner-btn');
  if (spinnerBtn) spinnerBtn.style.display = data.meta.lockedByTaskId ? 'none' : '';

  // Starter task
  const starterEl = document.getElementById('split-starter-task');
  if (starterEl) {
    const st = splitResult.starterTask;
    if (st) {
      starterEl.innerHTML =
        '<div class="ai-subtask-item split-starter-item">' +
          '<input type="text" class="edit-input split-starter-title"' +
          ' value="' + esc(st.title) + '" maxlength="80">' +
          '<input type="number" class="edit-input split-starter-min"' +
          ' value="' + (st.estimatedMinutes || 3) + '" min="1" max="30">' +
          '<span class="ai-subtask-unit">分</span>' +
        '</div>';
    } else {
      starterEl.innerHTML = '';
    }
  }

  // Subtasks
  const container = document.getElementById('split-ai-results');
  if (container && splitResult.subtasks) {
    container.innerHTML = splitResult.subtasks.map((st, i) =>
      '<div class="ai-subtask-item">' +
        '<span class="ai-subtask-num">' + (i + 1) + '.</span>' +
        '<input type="text" class="edit-input ai-subtask-title"' +
        ' value="' + esc(st.title) + '" maxlength="60" data-idx="' + i + '">' +
        '<input type="number" class="edit-input ai-subtask-min"' +
        ' value="' + (st.estimatedMinutes || 10) + '" min="1" max="60" data-idx="' + i + '">' +
        '<span class="ai-subtask-unit">分</span>' +
      '</div>'
    ).join('');
  }
}

function collectSplitTasks() {
  const all = [];
  const stEl  = document.querySelector('.split-starter-title');
  const stMin = document.querySelector('.split-starter-min');
  if (stEl && stEl.value.trim())
    all.push({ title: stEl.value.trim(), estimatedMinutes: Math.max(1, parseInt(stMin ? stMin.value : '3') || 3) });
  document.querySelectorAll('.ai-subtask-title').forEach((el, i) => {
    const minEl = document.querySelectorAll('.ai-subtask-min')[i];
    const title = el.value.trim();
    if (title) all.push({ title, estimatedMinutes: Math.max(1, parseInt(minEl ? minEl.value : '10') || 10) });
  });
  return all;
}

function startChainFromSplit() {
  if (!splitTaskTarget) return;
  const tasks = collectSplitTasks();
  if (tasks.length === 0) { cancelSplit(); return; }

  const parent  = splitTaskTarget;
  const chainId = generateId();
  const chain   = {
    id: chainId, parentTaskId: String(parent.id), parentTaskTitle: parent.title,
    status: 'active', createdAt: new Date().toISOString(),
    steps: tasks.map((t, i) => ({ id: generateId(), title: t.title,
      estimatedMinutes: t.estimatedMinutes, status: 'pending', order: i }))
  };
  if (!data.meta.chains) data.meta.chains = [];
  data.meta.chains.push(chain);
  currentChain = chain;
  parent.activeInCurrentRound = false;
  data.meta.lockedByTaskId = null; // chain itself is now the lock
  logActivity('chain_started', { taskId: chainId, taskTitle: parent.title,
    parentTaskId: String(parent.id), parentTaskTitle: parent.title, category: parent.category });
  saveData(); renderAll();

  document.getElementById('split-modal').classList.add('hidden');
  splitTaskTarget = null; aiGeneratedSubtasks = null;
  showChainMode();
}

function addToSpinnerFromSplit() {
  const tasks = collectSplitTasks();
  if (tasks.length === 0) { cancelSplit(); return; }
  applySplit(tasks);
}

// ── Task Chain ────────────────────────────────────────────────────────────
function showChainMode() {
  if (!currentChain) return;
  const step = currentChain.steps.find(s => s.status === 'pending');
  if (!step) { finishChain(); return; }
  const done  = currentChain.steps.filter(s => s.status !== 'pending').length;
  const total = currentChain.steps.length;
  document.getElementById('chain-parent-title').textContent = currentChain.parentTaskTitle;
  document.getElementById('chain-progress').textContent     = `步骤 ${done + 1} / ${total}`;
  document.getElementById('chain-step-title').textContent   = step.title;
  document.getElementById('chain-step-mins').textContent    = `预计 ${step.estimatedMinutes} 分钟`;
  document.getElementById('chain-progress-bar').style.width = Math.round((done / total) * 100) + '%';
  document.getElementById('chain-skip-btn').classList.add('hidden'); // no skipping chain steps
  document.getElementById('chain-mode-modal').classList.remove('hidden');
}

function advanceChainStep(status) {
  if (!currentChain) return;
  const step = currentChain.steps.find(s => s.status === 'pending');
  if (!step) return;
  step.status = status;
  saveData();
  const next = currentChain.steps.find(s => s.status === 'pending');
  if (!next) { document.getElementById('chain-mode-modal').classList.add('hidden'); finishChain(); }
  else showChainMode();
}

function finishChain() {
  if (!currentChain) return;
  currentChain.status = 'completed';
  currentChain.completedAt = new Date().toISOString();
  // Mark the original parent task as completed
  const parentTask = data.tasks.find(t => String(t.id) === String(currentChain.parentTaskId));
  if (parentTask) {
    parentTask.completed            = true;
    parentTask.completedCount       = (parentTask.completedCount || 0) + 1;
    parentTask.activeInCurrentRound = false;
  }
  data.meta.lockedByTaskId = null; // chain done — spin is now allowed
  logActivity('chain_completed', { taskId: currentChain.id, taskTitle: currentChain.parentTaskTitle,
    parentTaskId: currentChain.parentTaskId, parentTaskTitle: currentChain.parentTaskTitle });
  logActivity('task_done', {
    taskId: currentChain.parentTaskId, taskTitle: currentChain.parentTaskTitle,
    parentTaskId: null, parentTaskTitle: null,
    category: parentTask ? parentTask.category : 'study',
    estimatedMinutes: parentTask ? parentTask.estimatedMinutes : 0
  });
  bumpStat('completedToday', 'totalCompleted');
  saveData();
  const title = currentChain.parentTaskTitle;
  currentChain = null;
  renderAll(); // re-render to reflect parent task completion
  showToast('任务链完成：' + title + ' 🎉');
}

function abandonChain() {
  if (!currentChain) return;
  const parentTaskId    = currentChain.parentTaskId;
  const parentTaskTitle = currentChain.parentTaskTitle;
  currentChain.status   = 'abandoned';
  // Re-lock: user must create a new chain for this task before spinning
  data.meta.lockedByTaskId = parentTaskId;
  saveData();
  currentChain = null;
  document.getElementById('chain-mode-modal').classList.add('hidden');
  updateChainBanner();
  updateSpinLock();
  // Re-open split modal so user must choose a new approach
  const parentTask = data.tasks.find(t => String(t.id) === String(parentTaskId));
  openSplitModal(parentTask || { id: parentTaskId, title: parentTaskTitle, category: 'study', difficulty: 'easy', estimatedMinutes: 15 });
  showToast('已重置任务链，请重新拆分 ↩');
}

function updateSpinLock() {
  const chainActive   = !!(currentChain && currentChain.status === 'active');
  const procrastLock  = !!data.meta.lockedByTaskId;
  const resultPending = !!data.meta.pendingTaskResultId;
  const locked = chainActive || procrastLock || resultPending;

  const btn = document.getElementById('spin-btn');
  const msg = document.getElementById('spin-lock-msg');
  if (btn) btn.disabled = locked || isSpinning;
  if (msg) {
    if (!locked) {
      msg.classList.add('hidden');
    } else if (resultPending && !procrastLock && !chainActive) {
      // Task shown in result modal; user hasn't acted yet (covers page-refresh case)
      const t = data.tasks.find(t => String(t.id) === String(data.meta.pendingTaskResultId));
      msg.textContent = '🔒 请先处理「' + (t ? t.title : '当前任务') + '」，才能继续抽取';
      msg.classList.remove('hidden');
    } else {
      msg.textContent = '🔒 先完成当前任务链，才能继续下一轮抽取';
      msg.classList.remove('hidden');
    }
  }
}

function updateChainBanner() {
  const banner = document.getElementById('chain-banner');
  if (!banner) return;
  if (currentChain && currentChain.status === 'active') {
    const done  = currentChain.steps.filter(s => s.status !== 'pending').length;
    const total = currentChain.steps.length;
    document.getElementById('chain-banner-title').textContent =
      currentChain.parentTaskTitle + ' (' + done + '/' + total + ')';
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function renderManualInputs(count) {
  const container = document.getElementById('split-inputs');
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.className   = 'edit-input split-input';
    inp.placeholder = `子任务 ${i + 1}...`;
    inp.maxLength   = 40;
    container.appendChild(inp);
  }
  document.getElementById('split-add-btn').style.display    = count >= 5 ? 'none' : '';
  document.getElementById('split-remove-btn').style.display = count <= 2 ? 'none' : '';
}

function confirmManualSplit() {
  const names = [...document.querySelectorAll('.split-input')]
    .map(el => el.value.trim()).filter(Boolean);
  if (names.length === 0) { cancelSplit(); return; }
  applySplit(names.map(title => ({ title, estimatedMinutes: 15 })));
}

function applySplit(subtasks) {
  if (splitTaskTarget) {
    const parent = splitTaskTarget;
    parent.activeInCurrentRound = false;
    subtasks.forEach((st, i) => {
      data.tasks.push({
        id: nextId++, title: st.title,
        category: parent.category || 'study', difficulty: 'easy',
        estimatedMinutes: st.estimatedMinutes || 15, weight: 2,
        repeatable: false, frequency: 'once',
        completed: false, completedCount: 0, procrastinatedCount: 0, skippedCount: 0,
        activeInCurrentRound: true,
        isSubtask: true, subtaskOrder: i,
        parentTaskId: String(parent.id), parentTaskTitle: parent.title, chainId: null
      });
    });
    saveData(); renderAll();
  }
  document.getElementById('split-modal').classList.add('hidden');
  splitTaskTarget = null; aiGeneratedSubtasks = null;
  showToast('已拆分为 ' + subtasks.length + ' 个子任务 ✂️');
}

function cancelSplit() {
  // Cannot dismiss split modal while there is an active lock (procrastination)
  if (data.meta.lockedByTaskId) {
    showToast('请先拆分任务并完成，才能继续抽取 🔒');
    return;
  }
  document.getElementById('split-modal').classList.add('hidden');
  splitTaskTarget     = null;
  aiGeneratedSubtasks = null;
  renderAll();
}

document.getElementById('split-backdrop').addEventListener('click', cancelSplit);
document.getElementById('split-ai-btn').addEventListener('click', requestAiSplit);
document.getElementById('split-manual-btn').addEventListener('click', () => {
  renderManualInputs(2);
  setSplitState('manual');
});
document.getElementById('split-no-btn').addEventListener('click', cancelSplit);
document.getElementById('split-chain-btn').addEventListener('click', startChainFromSplit);
document.getElementById('split-spinner-btn').addEventListener('click', addToSpinnerFromSplit);
document.getElementById('split-reject-btn').addEventListener('click', () => setSplitState('choice'));
document.getElementById('split-retry-btn').addEventListener('click', requestAiSplit);
document.getElementById('split-err-manual-btn').addEventListener('click', () => {
  renderManualInputs(2);
  setSplitState('manual');
});
document.getElementById('split-add-btn').addEventListener('click', () => {
  const count = document.querySelectorAll('.split-input').length;
  if (count < 5) renderManualInputs(count + 1);
});
document.getElementById('split-remove-btn').addEventListener('click', () => {
  const count = document.querySelectorAll('.split-input').length;
  if (count > 2) renderManualInputs(count - 1);
});
document.getElementById('split-confirm-btn').addEventListener('click', confirmManualSplit);
document.getElementById('split-cancel-btn').addEventListener('click', cancelSplit);
document.getElementById('chain-done-btn').addEventListener('click',    () => advanceChainStep('done'));
document.getElementById('chain-skip-btn').addEventListener('click',    () => advanceChainStep('skipped'));
document.getElementById('chain-abandon-btn').addEventListener('click', abandonChain);

function onTaskChainClick(e) {
  const isChainActive = currentChain !== null && currentChain.status === 'active';
  console.log('task-chain clicked', { isChainActive, currentChain });
  if (!isChainActive) return;
  showChainMode();
}

document.getElementById('task-chain-btn').addEventListener('click', e => { e.stopPropagation(); onTaskChainClick(e); });
document.getElementById('chain-banner').addEventListener('click',   onTaskChainClick);

// ── Render: Rewards ────────────────────────────────────────────────────────
function renderRewards() {
  const activeRewards = data.rewards.filter(r => r.active !== false);
  document.getElementById('rewards-list').innerHTML = activeRewards.map((r, i) => {
    const banked = r.banked || 0;
    return `
      <div class="reward-item" data-id="${r.id}">
        <div class="reward-dot" style="background:${REWARD_COLORS[i % REWARD_COLORS.length]}"></div>
        <span class="reward-name">${esc(r.title)}</span>
        <span class="reward-dur">${r.durationMinutes || 30}分</span>
        ${banked > 0 ? `<span class="reward-banked">×${banked}</span>` : ''}
        ${banked > 0 ? `<button class="btn-use-banked" data-id="${r.id}">用一个</button>` : ''}
        <span class="reward-edit-icon">✏️</span>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.reward-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('btn-use-banked')) return;
      openRewardEditModal(+el.dataset.id);
    });
  });
  document.querySelectorAll('.btn-use-banked').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      useBankedReward(+btn.dataset.id);
    });
  });
}

// ── Render: Tasks ──────────────────────────────────────────────────────────
function renderTasks() {
  const list = document.getElementById('tasks-list');
  if (data.tasks.length === 0) {
    list.innerHTML = '<div class="empty-state">还没有任务，点击"添加任务"开始吧！</div>';
    return;
  }
  const DIFF_COLOR = { easy: '#34d399', medium: '#fbbf24', hard: '#f87171' };
  list.innerHTML = data.tasks.map((t, i) => {
    const inactive   = !t.activeInCurrentRound && !t.completed;
    const diffColor  = DIFF_COLOR[t.difficulty] || '#8b8fa8';
    const catLabel   = CATEGORY_LABELS[t.category]  || t.category  || '';
    const diffLabel  = DIFFICULTY_LABELS[t.difficulty] || '';
    const onceTag    = (!t.repeatable || t.frequency === 'once')
      ? '<span class="task-tag once-tag">一次性</span>' : '';
    return `
      <div class="task-item ${t.completed ? 'completed' : ''} ${inactive ? 'inactive' : ''}" data-id="${t.id}">
        <div class="task-checkbox ${t.completed ? 'checked' : ''}" data-toggle="${t.id}">
          ${t.completed ? '✓' : ''}
        </div>
        <div class="task-dot" style="background:${TASK_COLORS[i % TASK_COLORS.length]}"></div>
        <div class="task-info">
          <span class="task-name">${esc(t.title)}</span>
          <span class="task-meta">
            <span class="task-tag" style="color:${diffColor}">${diffLabel}</span>
            <span class="task-tag">${catLabel}</span>
            <span class="task-tag">${t.estimatedMinutes || 15}分</span>
            ${onceTag}
          </span>
        </div>
        <div class="task-actions">
          <button class="icon-btn" data-edit="${t.id}" title="编辑">✏️</button>
          <button class="icon-btn delete" data-del="${t.id}" title="删除">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => toggleTask(+el.dataset.toggle));
  });
  list.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); openTaskEditModal(+el.dataset.edit); });
  });
  list.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); deleteTask(+el.dataset.del); });
  });
}

// ── Render: Round Progress ─────────────────────────────────────────────────
function renderRoundProgress() {
  const el = document.getElementById('round-progress');
  if (!el) return;
  const total     = data.tasks.filter(t => t.activeInCurrentRound || t.completed).length;
  const done      = data.tasks.filter(t => t.completed).length;
  const active    = data.tasks.filter(t => t.activeInCurrentRound && !t.completed).length;
  const rewards   = data.rewards.filter(r => r.active !== false).length;
  const pct       = total > 0 ? Math.round((done / total) * 100) : 0;
  el.innerHTML = `
    <div class="progress-row">
      <span class="progress-label">完成 ${done} / ${total} 个任务</span>
      <span class="progress-pct">${pct}%</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width:${pct}%"></div>
    </div>
    <div class="progress-details">
      <span>🔄 待完成 ${active}</span>
      <span>✅ 已完成 ${done}</span>
      <span>🏆 奖励 ${rewards} 个</span>
    </div>
  `;
}

// ── Stats computation ──────────────────────────────────────────────────────
function getDateRange(tab) {
  const now = new Date();
  const tod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (tab === 'today') return { start: tod, end: new Date(tod.getTime() + 86400000) };
  if (tab === 'week') {
    const start = new Date(tod.getTime() - tod.getDay() * 86400000);
    return { start, end: new Date(start.getTime() + 7 * 86400000) };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

function computeStats(tab) {
  const { start, end } = getDateRange(tab);
  const log = (data.meta.activityLog || []).filter(e => {
    const t = new Date(e.timestamp); return t >= start && t < end;
  });
  const done = log.filter(e => e.action === 'task_done');
  return {
    completed: done.length,
    estimatedMinutes: done.reduce((s, e) => s + (e.estimatedMinutes || 0), 0),
    procrastinated: log.filter(e => e.action === 'task_procrastinated').length,
    skipped:        log.filter(e => e.action === 'task_skipped').length,
    rewardsBanked:  log.filter(e => e.action === 'reward_banked').length,
    rewardsUsed:    log.filter(e => e.action === 'reward_used').length,
    chainsCompleted: log.filter(e => e.action === 'chain_completed').length,
    completedTasks: done
  };
}

// ── Render: Stats ──────────────────────────────────────────────────────────
function renderStats() {
  const el = document.getElementById('stats-panel-body');
  if (!el) return;
  const s = computeStats(statsTab);
  const TAB_LABELS = [['today','今日'],['week','本周'],['month','本月']];
  el.innerHTML =
    '<div class="stats-tabs">' +
    TAB_LABELS.map(([k,lbl]) =>
      '<button class="stats-tab' + (statsTab === k ? ' active' : '') +
      '" data-tab="' + k + '">' + lbl + '</button>').join('') +
    '</div>' +
    '<div class="stats-grid">' +
    '<div class="stat-item"><span class="stat-num">' + s.completed + '</span><span class="stat-lbl">完成任务</span></div>' +
    '<div class="stat-item"><span class="stat-num">' + s.estimatedMinutes + '</span><span class="stat-lbl">专注分钟</span></div>' +
    '<div class="stat-item"><span class="stat-num">' + s.procrastinated + '</span><span class="stat-lbl">拖延次数</span></div>' +
    '<div class="stat-item"><span class="stat-num">' + s.skipped + '</span><span class="stat-lbl">跳过次数</span></div>' +
    '</div>' +
    '<div class="stats-row2">' +
    '<span>🔗 任务链: ' + s.chainsCompleted + '</span>' +
    '<span>🏦 存奖: ' + s.rewardsBanked + '</span>' +
    '<span>🎉 用奖: ' + s.rewardsUsed + '</span>' +
    '</div>' +
    (s.completedTasks.length > 0
      ? '<div class="stats-task-list">' +
        s.completedTasks.slice(0, 5).map(e =>
          '<div class="stats-task-item">' +
          '<span class="stats-task-title">' + esc(e.taskTitle || '未知') + '</span>' +
          (e.parentTaskTitle ? '<span class="stats-task-parent">↳ ' + esc(e.parentTaskTitle) + '</span>' : '') +
          '</div>'
        ).join('') +
        (s.completedTasks.length > 5 ? '<div class="stats-task-more">还有 ' + (s.completedTasks.length - 5) + ' 项</div>' : '') +
        '</div>'
      : '');

  el.querySelectorAll('.stats-tab').forEach(btn => {
    btn.addEventListener('click', () => { statsTab = btn.dataset.tab; renderStats(); });
  });
}

// ── updateStats (wheel-section counter) ───────────────────────────────────
function updateStats() {
  const active    = data.tasks.filter(t => t.activeInCurrentRound && !t.completed).length;
  const completed = data.tasks.filter(t => t.completed).length;
  const skipCount = data.meta && data.meta.skipCards ? data.meta.skipCards.count : 2;
  document.getElementById('stats-display').innerHTML =
    `${active} 个任务待完成 · ${completed} 个已完成<br>` +
    `<span class="skip-cards-stat">🃏 跳过卡本周剩余: ${skipCount}/2</span>`;
}

// ── Stats helpers ──────────────────────────────────────────────────────────
function bumpStat(todayKey, totalKey) {
  if (!data.meta.stats) data.meta.stats = migrateStats(null);
  if (data.meta.stats.todayKey !== getTodayKey()) {
    data.meta.stats = migrateStats(data.meta.stats);
  }
  if (todayKey) data.meta.stats[todayKey] = (data.meta.stats[todayKey] || 0) + 1;
  if (totalKey) data.meta.stats[totalKey] = (data.meta.stats[totalKey] || 0) + 1;
  saveData();
}

// ── Task CRUD ──────────────────────────────────────────────────────────────
function toggleTask(id) {
  const t = data.tasks.find(t => t.id === id);
  if (t) {
    t.completed            = !t.completed;
    t.activeInCurrentRound = !t.completed;
    if (t.completed) {
      t.completedCount = (t.completedCount || 0) + 1;
      // Completing a task via the task list also clears the pending result lock
      if (String(t.id) === String(data.meta.pendingTaskResultId)) {
        data.meta.pendingTaskResultId = null;
      }
    }
    saveData();
    renderAll();
  }
}

function deleteTask(id) {
  data.tasks = data.tasks.filter(t => t.id !== id);
  saveData();
  renderAll();
}

document.getElementById('add-task-btn').addEventListener('click', () => openTaskEditModal(null));

document.getElementById('reset-tasks-btn').addEventListener('click', () => {
  data.tasks.forEach(t => {
    if (t.repeatable !== false && t.frequency !== 'once') {
      t.completed            = false;
      t.activeInCurrentRound = true;
    }
  });
  saveData();
  renderAll();
  showToast('本轮已重置（重复任务恢复活跃） ↺');
});

// ── Task Editor Modal ──────────────────────────────────────────────────────
function openTaskEditModal(id) {
  const isNew = !id;
  const t     = id ? data.tasks.find(t => t.id === id) : null;
  editContext  = { type: 'task', id };

  document.getElementById('task-edit-title').textContent        = isNew ? '添加新任务' : '编辑任务';
  document.getElementById('te-title').value                      = t ? t.title : '';
  document.getElementById('te-category').value                   = t ? (t.category    || 'study')  : 'study';
  document.getElementById('te-difficulty').value                 = t ? (t.difficulty  || 'easy')   : 'easy';
  document.getElementById('te-minutes').value                    = t ? (t.estimatedMinutes || 15)   : 15;
  document.getElementById('te-weight').value                     = t ? (t.weight      || 2)        : 2;
  document.getElementById('te-repeatable').checked               = t ? (t.repeatable !== false)     : true;
  document.getElementById('te-frequency').value                  = t ? (t.frequency   || 'custom') : 'custom';

  updateFreqVisibility();
  document.getElementById('task-edit-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('te-title').focus(), 60);
}

function updateFreqVisibility() {
  const rep = document.getElementById('te-repeatable').checked;
  document.getElementById('te-freq-row').style.display = rep ? '' : 'none';
  if (!rep) document.getElementById('te-frequency').value = 'once';
}

document.getElementById('te-repeatable').addEventListener('change', updateFreqVisibility);
document.getElementById('task-edit-confirm').addEventListener('click', confirmTaskEdit);
document.getElementById('task-edit-cancel').addEventListener('click',  closeTaskEditModal);
document.getElementById('task-edit-backdrop').addEventListener('click', closeTaskEditModal);
document.getElementById('te-title').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmTaskEdit();
  if (e.key === 'Escape') closeTaskEditModal();
});

function closeTaskEditModal() {
  document.getElementById('task-edit-modal').classList.add('hidden');
}

function confirmTaskEdit() {
  const title = document.getElementById('te-title').value.trim();
  if (!title) return;

  const fields = {
    title,
    category:         document.getElementById('te-category').value,
    difficulty:       document.getElementById('te-difficulty').value,
    estimatedMinutes: Math.max(1, parseInt(document.getElementById('te-minutes').value) || 15),
    weight:           Math.min(5, Math.max(1, parseInt(document.getElementById('te-weight').value) || 2)),
    repeatable:       document.getElementById('te-repeatable').checked,
    frequency:        document.getElementById('te-frequency').value
  };

  if (editContext.id) {
    const t = data.tasks.find(t => t.id === editContext.id);
    if (t) Object.assign(t, fields);
  } else {
    data.tasks.push({
      id: nextId++,
      ...fields,
      completed:           false,
      completedCount:      0,
      procrastinatedCount: 0,
      skippedCount:        0,
      activeInCurrentRound: true
    });
  }
  saveData();
  renderAll();
  closeTaskEditModal();
}

// ── Reward Editor Modal ────────────────────────────────────────────────────
function openRewardEditModal(id) {
  const r = data.rewards.find(r => r.id === id);
  editContext = { type: 'reward', id };
  document.getElementById('re-title').value    = r ? r.title : '';
  document.getElementById('re-duration').value = r ? (r.durationMinutes || 30) : 30;
  document.getElementById('reward-edit-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('re-title').focus(), 60);
}

document.getElementById('reward-edit-confirm').addEventListener('click', () => {
  const title = document.getElementById('re-title').value.trim();
  if (!title) return;
  const r = data.rewards.find(r => r.id === editContext.id);
  if (r) {
    r.title           = title;
    r.durationMinutes = Math.max(1, parseInt(document.getElementById('re-duration').value) || 30);
    saveData();
    renderAll();
  }
  document.getElementById('reward-edit-modal').classList.add('hidden');
});
document.getElementById('reward-edit-cancel').addEventListener('click', () => {
  document.getElementById('reward-edit-modal').classList.add('hidden');
});
document.getElementById('reward-edit-backdrop').addEventListener('click', () => {
  document.getElementById('reward-edit-modal').classList.add('hidden');
});

// ── Bulk Import ────────────────────────────────────────────────────────────
document.getElementById('bulk-import-btn').addEventListener('click', () => {
  document.getElementById('bulk-textarea').value = '';
  document.getElementById('bulk-error').textContent = '';
  document.getElementById('bulk-import-modal').classList.remove('hidden');
});
document.getElementById('bulk-cancel-btn').addEventListener('click', () => {
  document.getElementById('bulk-import-modal').classList.add('hidden');
});
document.getElementById('bulk-backdrop').addEventListener('click', () => {
  document.getElementById('bulk-import-modal').classList.add('hidden');
});
document.getElementById('bulk-confirm-btn').addEventListener('click', () => {
  const lines = document.getElementById('bulk-textarea').value
    .split('\n').map(l => l.trim()).filter(Boolean);

  const VALID_CAT  = ['study', 'life', 'health', 'project'];
  const VALID_DIFF = ['easy', 'medium', 'hard'];
  const errors = [], toAdd = [];

  lines.forEach((line, i) => {
    const parts = line.split('|').map(p => p.trim());
    const title  = parts[0];
    if (!title) { errors.push(`第 ${i+1} 行: 标题不能为空`); return; }
    const cat  = parts[1] || '';
    const diff = parts[2] || '';
    const mins = parseInt(parts[3]);
    const category         = VALID_CAT.includes(cat)   ? cat   : 'study';
    const difficulty       = VALID_DIFF.includes(diff) ? diff  : 'easy';
    const estimatedMinutes = mins > 0 ? mins : 15;
    if (cat  && !VALID_CAT.includes(cat))   errors.push(`第 ${i+1} 行: 分类 "${cat}" 无效，已设为 study`);
    if (diff && !VALID_DIFF.includes(diff)) errors.push(`第 ${i+1} 行: 难度 "${diff}" 无效，已设为 easy`);
    toAdd.push({ title, category, difficulty, estimatedMinutes });
  });

  if (toAdd.length === 0) {
    document.getElementById('bulk-error').textContent = '没有有效任务可导入';
    return;
  }

  toAdd.forEach(fields => {
    data.tasks.push({
      id: nextId++,
      ...fields,
      weight:              2,
      repeatable:          true,
      frequency:           'custom',
      completed:           false,
      completedCount:      0,
      procrastinatedCount: 0,
      skippedCount:        0,
      activeInCurrentRound: true
    });
  });

  saveData();
  renderAll();
  document.getElementById('bulk-import-modal').classList.add('hidden');
  showToast(`已导入 ${toAdd.length} 个任务 ✓`);
  if (errors.length) {
    document.getElementById('bulk-error').textContent = errors.join('\n');
  }
});

// ── Rules Panel toggle ─────────────────────────────────────────────────────
document.getElementById('rules-toggle-btn').addEventListener('click', () => {
  const body   = document.getElementById('rules-body');
  const isOpen = !body.classList.toggle('hidden');
  document.getElementById('rules-toggle-btn').textContent = isOpen ? '▼' : '▶';
});

// ── Utilities ──────────────────────────────────────────────────────────────
async function saveData() {
  await window.api.saveData(data);
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className  = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

function esc(text) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(text || ''));
  return d.innerHTML;
}

// ── Start ──────────────────────────────────────────────────────────────────
init();
