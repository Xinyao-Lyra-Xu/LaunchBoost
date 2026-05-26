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

// ── Timer State (result modal) ─────────────────────────────────────────────
let timerInterval   = null;
let timerSeconds    = 0;
let activeTimerTask = null;

// ── Chain Timer State ──────────────────────────────────────────────────────
let chainTimerInterval = null;
let chainTimerSeconds  = 0;
let chainTimerRunning  = false;

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

// ── Meta Migration & Daily Reset ───────────────────────────────────────────
function migrateMeta() {
  if (!data.meta) data.meta = {};
  if (data.meta.skipTickets                 === undefined) data.meta.skipTickets                 = data.meta.skipCards ? (data.meta.skipCards.count || 2) : 2;
  if (data.meta.totalMinutes                === undefined) data.meta.totalMinutes                = 0;
  if (data.meta.skipTicketsEarned           === undefined) data.meta.skipTicketsEarned           = 0;
  if (data.meta.skipTicketsUsed             === undefined) data.meta.skipTicketsUsed             = 0;
  if (data.meta.tasksCompletedTotal         === undefined) data.meta.tasksCompletedTotal         = data.meta.stats ? (data.meta.stats.totalCompleted || 0) : 0;
  if (data.meta.tasksCompletedToday         === undefined) data.meta.tasksCompletedToday         = 0;
  if (data.meta.minutesToday                === undefined) data.meta.minutesToday                = 0;
  if (data.meta.lastOpenDate                === undefined) data.meta.lastOpenDate                = getTodayKey();
  if (data.meta.activeDays                  === undefined) data.meta.activeDays                  = 1;
  if (data.meta.procrastinationRecoveryCount === undefined) data.meta.procrastinationRecoveryCount = 0;
  if (data.meta.chainCompletionCount        === undefined) data.meta.chainCompletionCount        = 0;
  if (data.meta.stuckCount                  === undefined) data.meta.stuckCount                  = 0;
  if (data.meta.activeChainId               === undefined) data.meta.activeChainId               = null;
  if (!data.meta.achievements) {
    data.meta.achievements = {
      firstTask: false, focus60: false, focus300: false,
      tickets3: false, ironWill: false, sprint5: false, habit7: false
    };
  }
}

// Normalize an existing chain to the current data model.
function migrateChain(chain) {
  if (!chain.source)                    chain.source      = 'manual';
  if (chain.completedAt  === undefined) chain.completedAt = null;
  if (chain.currentStepIndex === undefined) {
    const lastDoneIdx = chain.steps.reduce((max, s, i) =>
      (s.status !== 'pending' ? i : max), -1);
    chain.currentStepIndex = Math.max(0, Math.min(lastDoneIdx + 1, chain.steps.length - 1));
  }
  chain.steps = chain.steps.map(s => ({
    ...s,
    chainId:      s.chainId      || chain.id,
    parentTaskId: s.parentTaskId || chain.parentTaskId,
    description:  s.description  || '',
    // Normalize old 'done' status to 'completed'
    status:       s.status === 'done' ? 'completed' : (s.status || 'pending'),
    createdAt:    s.createdAt    || chain.createdAt,
    completedAt:  s.completedAt  || null
  }));
  // Ensure the current step is marked active if chain is active
  if (chain.status === 'active') {
    const cur = chain.steps[chain.currentStepIndex];
    if (cur && cur.status === 'pending') cur.status = 'active';
  }
  return chain;
}

function checkDailyReset() {
  const todayKey = getTodayKey();
  if (data.meta.lastOpenDate !== todayKey) {
    if (data.meta.lastOpenDate) data.meta.activeDays = (data.meta.activeDays || 1) + 1;
    data.meta.tasksCompletedToday = 0;
    data.meta.minutesToday = 0;
    data.meta.lastOpenDate = todayKey;
    saveData();
  }
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

  migrateMeta();
  checkDailyReset();
  data.meta.stats = migrateStats(data.meta.stats);

  if (!Array.isArray(data.meta.chains))      data.meta.chains      = [];
  if (!Array.isArray(data.meta.activityLog)) data.meta.activityLog = [];
  if (data.meta.lockedByTaskId      === undefined) data.meta.lockedByTaskId      = null;
  if (data.meta.pendingTaskResultId === undefined) data.meta.pendingTaskResultId = null;
  // Normalize existing chains to current data model
  data.meta.chains = data.meta.chains.map(migrateChain);
  // Defensive: if the pending task is already done, clear stale lock
  if (data.meta.pendingTaskResultId) {
    const pTask = data.tasks.find(t => String(t.id) === String(data.meta.pendingTaskResultId));
    if (!pTask || pTask.completed) data.meta.pendingTaskResultId = null;
  }
  currentChain = data.meta.chains.find(c => c.status === 'active') || null;
  data.meta.activeChainId = currentChain ? currentChain.id : null;
  console.log('[Chain] Init: active chain =', data.meta.activeChainId || 'none');

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

// Returns the current active chain, syncing from data store if stale.
function getActiveChain() {
  if (!currentChain || currentChain.status !== 'active') {
    currentChain = (data.meta.chains || []).find(c => c.status === 'active') || null;
    data.meta.activeChainId = currentChain ? currentChain.id : null;
  }
  return currentChain;
}

function renderAll() {
  drawWheel();
  renderRewards();
  renderTasks();
  renderRoundProgress();
  renderDailyCard();
  renderAchievements();
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
  if (getActiveChain() || data.meta.lockedByTaskId) return;
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
function showModalView(view) {
  const views = {
    main: 'modal-main-view', timer: 'modal-timer-view',
    skip: 'modal-skip-view', 'task-pick': 'modal-task-pick-view',
    stuck: 'modal-stuck-view', minimal: 'modal-minimal-view'
  };
  Object.entries(views).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', k !== view);
  });
}

function showResult(winner) {
  currentResult = winner;
  const content = document.getElementById('modal-content');
  content.className = 'modal-content';
  showModalView('main');

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
    const catLabel  = CATEGORY_LABELS[winner.item.category]    || winner.item.category    || '';
    const diffLabel = DIFFICULTY_LABELS[winner.item.difficulty] || winner.item.difficulty  || '';
    const mins      = winner.item.estimatedMinutes || 15;
    document.getElementById('modal-emoji').textContent = '📚';
    document.getElementById('modal-type').textContent  = `${catLabel}  ·  ${diffLabel}  ·  ${mins} 分钟`;
    document.getElementById('modal-title').textContent = winner.item.title;
    document.getElementById('modal-desc').textContent  = '加油！完成这个任务，你会离目标更近一步！';
    document.getElementById('modal-actions').innerHTML = `
      <button class="btn-complete"      id="complete-task-btn">完成 ✓</button>
      <button class="btn-secondary"     id="start-timer-btn">⏱️ 开始计时</button>
      <button class="btn-procrastinate" id="procrastinate-btn">🤔 遇到困难</button>
      <button class="btn-skip"          id="skip-btn">跳过 →</button>
    `;
    document.getElementById('complete-task-btn').addEventListener('click', completeCurrentTask);
    document.getElementById('start-timer-btn').addEventListener('click', () => startTimer(winner.item));
    document.getElementById('procrastinate-btn').addEventListener('click', procrastinateCurrentTask);
    document.getElementById('skip-btn').addEventListener('click', showSkipView);
    data.meta.pendingTaskResultId = String(winner.item.id);
    saveData();
    updateSpinLock();
  }
  document.getElementById('result-modal').classList.remove('hidden');
}

function closeResult() {
  stopActiveTimer();
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
  data.meta.pendingTaskResultId = null;
  data.meta.tasksCompletedToday = (data.meta.tasksCompletedToday || 0) + 1;
  data.meta.tasksCompletedTotal = (data.meta.tasksCompletedTotal || 0) + 1;
  bumpStat('completedToday', 'totalCompleted');
  logActivity('task_done', {
    taskId: String(currentResult.item.id), taskTitle: currentResult.item.title,
    parentTaskId: currentResult.item.parentTaskId || null,
    parentTaskTitle: currentResult.item.parentTaskTitle || null,
    category: currentResult.item.category,
    estimatedMinutes: currentResult.item.estimatedMinutes || 15
  });
  checkAchievements();
  saveData();
  renderAll();
  closeResult();
  showToast('任务完成！继续加油 🎉');
}

function procrastinateCurrentTask() {
  if (!currentResult || currentResult.type !== 'task') return;
  // Show the stuck-reason picker first; locking and decomposition happen after user picks a reason
  showStuckView();
}

// ── Stuck flow ────────────────────────────────────────────────────────────
const STUCK_REASONS = {
  whereToStart: {
    label: '🤷 不知道从哪里开始',
    emoji: '🗺️', header: '先画出地图',
    action: '花3分钟，在纸上写下你认为这个任务的第一步是什么——哪怕只是一个模糊的想法。',
    tip: '把想法写出来能激活执行脑区。不需要正确，只需要开始。',
    mins: 3, decompose: true
  },
  tooHard: {
    label: '💪 太难了，超出能力',
    emoji: '🔬', header: '先只看，不做',
    action: '只打开相关文件或材料，浏览一遍，不需要理解，也不需要做任何事。',
    tip: '任务感觉难，往往是因为它太抽象。光是"看一眼"就能让大脑开始处理。',
    mins: 5, decompose: true
  },
  tooBoring: {
    label: '😴 太无聊了，不想做',
    emoji: '⚡', header: '5分钟挑战',
    action: '就做5分钟，之后可以随时停。打开任务，设好计时器，开始。',
    tip: '无聊感通常在开始后迅速消退。给自己一个"只做5分钟"的许可。',
    mins: 5, decompose: false
  },
  tooTired: {
    label: '😩 状态不好，太累了',
    emoji: '🌿', header: '先恢复状态',
    action: '喝一杯水，站起来动一动，深呼吸3次，5分钟后再回来。',
    tip: '强撑着工作效率极低。短暂恢复后的5分钟 > 精疲力竭的30分钟。',
    mins: 5, decompose: false, useTicket: true
  },
  missingMaterials: {
    label: '📦 缺少必要材料或信息',
    emoji: '📋', header: '先列清单',
    action: '花5分钟，列出你需要但现在没有的所有东西。写完后决定怎么获取。',
    tip: '列清单本身就是在推进任务——你在把"不知道缺什么"变成"知道缺什么"。',
    mins: 5, decompose: true
  },
  fearOfFailure: {
    label: '😰 害怕做不好，有点焦虑',
    emoji: '🎭', header: '做"草稿"版本',
    action: '告诉自己这只是草稿，可以很糟糕。先把任何东西放进去，不考虑质量。',
    tip: '完美主义是行动的最大杀手。"写一个烂开头"比"什么都没有"强100倍。',
    mins: 10, decompose: true
  }
};

let currentStuckReason = null;

function showStuckView() {
  if (!currentResult || currentResult.type !== 'task') return;
  document.getElementById('stuck-task-ctx').textContent = '「' + currentResult.item.title + '」';
  const reasonsEl = document.getElementById('stuck-reasons');
  reasonsEl.innerHTML = Object.entries(STUCK_REASONS).map(([key, r]) =>
    `<button class="stuck-reason-btn" data-reason="${key}">${r.label}</button>`
  ).join('');
  reasonsEl.querySelectorAll('.stuck-reason-btn').forEach(btn => {
    btn.addEventListener('click', () => showMinimalView(btn.dataset.reason));
  });
  showModalView('stuck');
}

function showMinimalView(reasonKey) {
  const reason = STUCK_REASONS[reasonKey];
  if (!reason) return;
  currentStuckReason = reasonKey;

  document.getElementById('minimal-view-emoji').textContent   = reason.emoji;
  document.getElementById('minimal-view-header').textContent  = reason.header;
  document.getElementById('minimal-view-action').textContent  = reason.action;
  document.getElementById('minimal-view-tip').textContent     = '💡 ' + reason.tip;

  const actionsEl = document.getElementById('minimal-actions');
  const btns = [`<button class="btn-complete" id="minimal-start-btn">⏱️ 计时${reason.mins}分钟，开始</button>`];
  if (reason.decompose) btns.push(`<button class="btn-secondary" id="minimal-decompose-btn">✂️ 拆分任务</button>`);
  if (reason.useTicket) btns.push(`<button class="btn-secondary" id="minimal-ticket-btn">🎫 使用跳过券</button>`);
  actionsEl.innerHTML = btns.join('');

  document.getElementById('minimal-start-btn').addEventListener('click', () => {
    data.meta.stuckCount = (data.meta.stuckCount || 0) + 1;
    saveData();
    // Start a brief timer on the minimal action; completing it marks the whole task done
    const minTask = { ...currentResult.item, title: reason.header + '：' + currentResult.item.title, estimatedMinutes: reason.mins };
    startTimer(minTask);
  });
  const decompBtn = document.getElementById('minimal-decompose-btn');
  if (decompBtn) decompBtn.addEventListener('click', minimalDecompose);
  const ticketBtn = document.getElementById('minimal-ticket-btn');
  if (ticketBtn) ticketBtn.addEventListener('click', () => showSkipView());

  showModalView('minimal');
}

function minimalDecompose() {
  if (!currentResult || currentResult.type !== 'task') return;
  const task = data.tasks.find(t => t.id === currentResult.item.id);
  if (task) task.procrastinatedCount = (task.procrastinatedCount || 0) + 1;
  bumpStat('procrastinatedToday', 'totalProcrastinated');
  logActivity('task_procrastinated', {
    taskId: String(currentResult.item.id), taskTitle: currentResult.item.title,
    category: currentResult.item.category
  });
  data.meta.stuckCount          = (data.meta.stuckCount || 0) + 1;
  data.meta.pendingTaskResultId = null;
  data.meta.lockedByTaskId      = String(currentResult.item.id);
  saveData();
  console.log('[Stuck] User chose decompose — locking task', data.meta.lockedByTaskId);
  closeResult();
  openSplitModal(task || currentResult.item);
}

document.getElementById('stuck-back-btn').addEventListener('click', () => showModalView('main'));
document.getElementById('minimal-back-btn').addEventListener('click', () => showModalView('stuck'));

// ── Skip flow ──────────────────────────────────────────────────────────────
function showSkipView() {
  const tickets = data.meta.skipTickets || 0;
  document.getElementById('skip-ticket-sub').textContent = `剩余 ${tickets} 张`;
  const useBtn = document.getElementById('skip-use-ticket-btn');
  if (useBtn) useBtn.disabled = tickets <= 0;
  showModalView('skip');
}

function showTaskPickView() {
  const available = data.tasks.filter(t =>
    t.activeInCurrentRound && !t.completed &&
    (!currentResult || String(t.id) !== String(currentResult.item.id))
  );
  const list = document.getElementById('skip-task-list');
  if (available.length === 0) {
    list.innerHTML = '<div class="empty-state">没有其他可用任务</div>';
  } else {
    list.innerHTML = available.map(t => `
      <button class="skip-task-item" data-id="${t.id}">
        <span class="skip-task-title">${esc(t.title)}</span>
        <span class="skip-task-meta">${t.estimatedMinutes || 15}分</span>
      </button>
    `).join('');
    list.querySelectorAll('.skip-task-item').forEach(btn => {
      btn.addEventListener('click', () => doPickTask(+btn.dataset.id));
    });
  }
  showModalView('task-pick');
}

function doPickTask(taskId) {
  if (!currentResult || currentResult.type !== 'task') return;
  const skippedTask = data.tasks.find(t => t.id === currentResult.item.id);
  if (skippedTask) skippedTask.skippedCount = (skippedTask.skippedCount || 0) + 1;
  data.meta.pendingTaskResultId = null;
  bumpStat('skippedToday', 'totalSkipped');
  logActivity('task_skipped', { taskId: String(currentResult.item.id), taskTitle: currentResult.item.title, category: currentResult.item.category });
  saveData();
  renderAll();
  closeResult();
  const pickedTask = data.tasks.find(t => t.id === taskId);
  if (pickedTask) {
    showResult({ type: 'task', item: pickedTask });
  } else {
    showToast('已跳过当前任务');
  }
}

function doUseTicket() {
  if (!currentResult || currentResult.type !== 'task') return;
  if ((data.meta.skipTickets || 0) <= 0) { showToast('没有跳过券了 🎫'); return; }
  data.meta.skipTickets--;
  data.meta.skipTicketsUsed = (data.meta.skipTicketsUsed || 0) + 1;
  const task = data.tasks.find(t => t.id === currentResult.item.id);
  if (task) task.skippedCount = (task.skippedCount || 0) + 1;
  data.meta.pendingTaskResultId = null;
  bumpStat('skippedToday', 'totalSkipped');
  logActivity('task_skipped', { taskId: String(currentResult.item.id), taskTitle: currentResult.item.title, category: currentResult.item.category });
  saveData();
  renderAll();
  const remaining = data.meta.skipTickets;
  closeResult();
  showToast(`使用跳过券休息！还剩 ${remaining} 张 🎫`);
}

document.getElementById('skip-back-btn').addEventListener('click', () => showModalView('main'));
document.getElementById('skip-pick-task-btn').addEventListener('click', showTaskPickView);
document.getElementById('skip-use-ticket-btn').addEventListener('click', doUseTicket);
document.getElementById('skip-task-back-btn').addEventListener('click', () => showModalView('skip'));

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

// ── Timer (stopwatch) ──────────────────────────────────────────────────────
function startTimer(task) {
  activeTimerTask = task;
  timerSeconds = 0;
  clearInterval(timerInterval);
  document.getElementById('timer-view-task').textContent = task.title;
  document.getElementById('timer-view-display').textContent = '00:00';
  showModalView('timer');
  timerInterval = setInterval(() => {
    timerSeconds++;
    const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
    const s = (timerSeconds % 60).toString().padStart(2, '0');
    document.getElementById('timer-view-display').textContent = `${m}:${s}`;
  }, 1000);
}

function stopActiveTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  const mins = Math.floor(timerSeconds / 60);
  timerSeconds = 0;
  activeTimerTask = null;
  return mins;
}

function completeTimedTask() {
  const mins = stopActiveTimer();
  if (mins > 0) addStudyMinutes(mins);
  completeCurrentTask();
}

function stopTimerOnly() {
  const mins = stopActiveTimer();
  if (mins > 0) addStudyMinutes(mins);
  showModalView('main');
}

document.getElementById('timer-complete-btn').addEventListener('click', completeTimedTask);
document.getElementById('timer-stop-new-btn').addEventListener('click', stopTimerOnly);

// ── Chain Timer ────────────────────────────────────────────────────────────
function updateChainTimerDisplay() {
  const el = document.getElementById('chain-timer-display');
  if (!el) return;
  const m = Math.floor(chainTimerSeconds / 60).toString().padStart(2, '0');
  const s = (chainTimerSeconds % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;
  el.classList.toggle('running', chainTimerRunning);
}

function startChainTimer() {
  chainTimerRunning = true;
  const btn = document.getElementById('chain-timer-btn');
  if (btn) { btn.textContent = '⏸ 暂停'; btn.classList.add('pausing'); }
  chainTimerInterval = setInterval(() => {
    chainTimerSeconds++;
    updateChainTimerDisplay();
  }, 1000);
}

function pauseChainTimer() {
  chainTimerRunning = false;
  clearInterval(chainTimerInterval);
  chainTimerInterval = null;
  const btn = document.getElementById('chain-timer-btn');
  if (btn) { btn.textContent = '▶ 继续计时'; btn.classList.remove('pausing'); }
  updateChainTimerDisplay();
}

function toggleChainTimer() {
  if (chainTimerRunning) pauseChainTimer();
  else startChainTimer();
}

// Stops timer, returns elapsed minutes, resets seconds to 0
function flushChainTimer() {
  clearInterval(chainTimerInterval);
  chainTimerInterval = null;
  chainTimerRunning  = false;
  const mins = Math.floor(chainTimerSeconds / 60);
  chainTimerSeconds  = 0;
  const btn = document.getElementById('chain-timer-btn');
  if (btn) { btn.textContent = '⏱ 开始计时'; btn.classList.remove('pausing'); }
  updateChainTimerDisplay();
  return mins;
}

function closeChainModal() {
  const mins = flushChainTimer();
  if (mins > 0) addStudyMinutes(mins);
  document.getElementById('chain-mode-modal').classList.add('hidden');
}

document.getElementById('chain-timer-btn').addEventListener('click', toggleChainTimer);
document.getElementById('chain-close-btn').addEventListener('click', closeChainModal);
document.getElementById('chain-mode-backdrop').addEventListener('click', closeChainModal);

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

// ── createTaskChain: single entry point for all chain creation paths ─────────
function createTaskChain(parent, subtasks, source) {
  if (!parent) { console.warn('[Chain] createTaskChain: parent is null'); return null; }
  if (!subtasks || subtasks.length === 0) { console.warn('[Chain] createTaskChain: no subtasks'); return null; }

  // Cancel any stale active chain (defensive — should not happen normally)
  const existingActive = (data.meta.chains || []).find(c => c.status === 'active');
  if (existingActive) {
    console.warn('[Chain] createTaskChain: cancelling stale active chain', existingActive.id);
    existingActive.status = 'cancelled';
    existingActive.completedAt = new Date().toISOString();
  }

  const chainId = generateId();
  const now     = new Date().toISOString();
  const chain   = {
    id: chainId,
    parentTaskId:    String(parent.id),
    parentTaskTitle: parent.title,
    source:          source || 'manual', // 'ai' | 'manual' | 'procrastination' | 'template'
    status:          'active',
    currentStepIndex: 0,
    createdAt:  now,
    completedAt: null,
    steps: subtasks.map((t, i) => ({
      id:               generateId(),
      chainId:          chainId,
      parentTaskId:     String(parent.id),
      title:            t.title,
      description:      t.description || '',
      estimatedMinutes: t.estimatedMinutes || 15,
      status:           i === 0 ? 'active' : 'pending', // first step starts active
      order:            i,
      createdAt:        now,
      completedAt:      null
    }))
  };

  console.log('[Chain] Created chain', chainId, '| source:', source, '| steps:', chain.steps.length);

  if (!data.meta.chains) data.meta.chains = [];
  data.meta.chains.push(chain);
  currentChain             = chain;
  data.meta.activeChainId  = chainId;
  parent.activeInCurrentRound = false;
  data.meta.lockedByTaskId = null; // chain is the lock from now on

  logActivity('chain_started', {
    taskId: chainId, taskTitle: parent.title,
    parentTaskId: String(parent.id), parentTaskTitle: parent.title,
    category: parent.category, source
  });
  return chain;
}

function startChainFromSplit() {
  if (!splitTaskTarget) return;
  const tasks = collectSplitTasks();
  if (tasks.length === 0) { cancelSplit(); return; }
  // Determine source: if AI results are visible, it's 'ai'; otherwise 'manual'
  const source = aiGeneratedSubtasks ? 'ai' : 'manual';
  const chain  = createTaskChain(splitTaskTarget, tasks, source);
  if (!chain) { cancelSplit(); return; }
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
  console.log('[Chain] showChainMode called');
  const chain = getActiveChain();
  if (!chain) {
    console.warn('[Chain] showChainMode: no active chain');
    return;
  }
  if (!Array.isArray(chain.steps) || chain.steps.length === 0) {
    console.warn('[Chain] showChainMode: chain has no steps — finishing');
    finishChain();
    return;
  }

  // Ensure currentStepIndex points to an active/pending step
  let step = chain.steps[chain.currentStepIndex];
  if (!step || (step.status !== 'active' && step.status !== 'pending')) {
    const nextIdx = chain.steps.findIndex(s => s.status === 'pending' || s.status === 'active');
    if (nextIdx === -1) { finishChain(); return; }
    chain.currentStepIndex = nextIdx;
    step = chain.steps[nextIdx];
  }
  if (step.status === 'pending') step.status = 'active';

  const done  = chain.steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
  const total = chain.steps.length;

  console.log('[Chain] Showing step', chain.currentStepIndex, '/', total - 1, ':', step.title);

  document.getElementById('chain-parent-title').textContent = chain.parentTaskTitle;
  document.getElementById('chain-progress').textContent     = `步骤 ${done + 1} / ${total}`;
  document.getElementById('chain-step-title').textContent   = step.title;
  document.getElementById('chain-step-mins').textContent    = `预计 ${step.estimatedMinutes} 分钟`;
  document.getElementById('chain-progress-bar').style.width = Math.round((done / total) * 100) + '%';
  document.getElementById('chain-skip-btn').classList.add('hidden');

  // 鼓励文案：还剩几步（不含当前这步）
  const remaining = total - done - 1;
  const encourageEl = document.getElementById('chain-encourage');
  if (encourageEl) {
    if (remaining === 0) {
      encourageEl.textContent = '最后一步！冲！🔥';
      encourageEl.style.color = '#f97316';
    } else if (remaining === 1) {
      encourageEl.textContent = '还剩 1 步，完成后大任务解锁 🔓';
      encourageEl.style.color = '#a78bfa';
    } else {
      encourageEl.textContent = `还剩 ${remaining} 步，加油！💪`;
      encourageEl.style.color = 'var(--text-secondary)';
    }
  }

  // 如果没在计时则重置计时器显示（切到新步骤时归零）
  if (!chainTimerRunning) {
    chainTimerSeconds = 0;
    updateChainTimerDisplay();
    const btn = document.getElementById('chain-timer-btn');
    if (btn) { btn.textContent = '⏱ 开始计时'; btn.classList.remove('pausing'); }
  }

  document.getElementById('chain-mode-modal').classList.remove('hidden');
}

function advanceChainStep(stepStatus) {
  const chain = getActiveChain();
  if (!chain) return;

  // 停计时器并记录本步骤时间
  const mins = flushChainTimer();
  if (mins > 0) addStudyMinutes(mins);

  const step = chain.steps[chain.currentStepIndex];
  if (!step) { console.warn('[Chain] advanceChainStep: no step at index', chain.currentStepIndex); finishChain(); return; }

  step.status      = stepStatus; // 'completed' | 'skipped'
  step.completedAt = new Date().toISOString();
  console.log('[Chain] Step', chain.currentStepIndex, 'marked', stepStatus);

  // Find the next pending step
  const nextIdx = chain.steps.findIndex((s, i) => i > chain.currentStepIndex && s.status === 'pending');
  if (nextIdx === -1) {
    document.getElementById('chain-mode-modal').classList.add('hidden');
    finishChain();
  } else {
    chain.currentStepIndex       = nextIdx;
    chain.steps[nextIdx].status  = 'active';
    console.log('[Chain] Advancing to step', nextIdx);
    saveData();
    showChainMode();
  }
}

function finishChain() {
  const chain = getActiveChain() || currentChain;
  if (!chain) { console.warn('[Chain] finishChain: no chain to finish'); return; }

  console.log('[Chain] Finishing chain', chain.id, '| source:', chain.source);

  chain.status      = 'completed';
  chain.completedAt = new Date().toISOString();
  currentChain      = null;
  data.meta.activeChainId = null;

  const parentTask = data.tasks.find(t => String(t.id) === String(chain.parentTaskId));
  if (parentTask) {
    parentTask.completed            = true;
    parentTask.completedCount       = (parentTask.completedCount || 0) + 1;
    parentTask.activeInCurrentRound = false;
  }

  data.meta.lockedByTaskId      = null;
  data.meta.tasksCompletedToday = (data.meta.tasksCompletedToday || 0) + 1;
  data.meta.tasksCompletedTotal = (data.meta.tasksCompletedTotal || 0) + 1;
  data.meta.chainCompletionCount = (data.meta.chainCompletionCount || 0) + 1;
  if (chain.source === 'procrastination') {
    data.meta.procrastinationRecoveryCount = (data.meta.procrastinationRecoveryCount || 0) + 1;
  }

  logActivity('chain_completed', {
    taskId: chain.id, taskTitle: chain.parentTaskTitle,
    parentTaskId: chain.parentTaskId, parentTaskTitle: chain.parentTaskTitle, source: chain.source
  });
  logActivity('task_done', {
    taskId: chain.parentTaskId, taskTitle: chain.parentTaskTitle,
    parentTaskId: null, parentTaskTitle: null,
    category: parentTask ? parentTask.category : 'study',
    estimatedMinutes: parentTask ? parentTask.estimatedMinutes : 0
  });
  bumpStat('completedToday', 'totalCompleted');
  checkAchievements();
  saveData();
  renderAll();
  showToast('任务链完成：' + chain.parentTaskTitle + ' 🎉');
}

function abandonChain() {
  // 先停链式计时器，保留已计时的分钟数
  const mins = flushChainTimer();
  if (mins > 0) addStudyMinutes(mins);

  const chain = getActiveChain();
  if (!chain) return;
  const parentTaskId    = chain.parentTaskId;
  const parentTaskTitle = chain.parentTaskTitle;
  chain.status          = 'cancelled';
  chain.completedAt     = new Date().toISOString();
  currentChain          = null;
  data.meta.activeChainId = null;
  // Re-lock: user must create a new chain before spinning again
  data.meta.lockedByTaskId = parentTaskId;
  console.log('[Chain] Abandoned chain', chain.id, '— re-locking task', parentTaskId);
  saveData();
  document.getElementById('chain-mode-modal').classList.add('hidden');
  updateChainBanner();
  updateSpinLock();
  const parentTask = data.tasks.find(t => String(t.id) === String(parentTaskId));
  openSplitModal(parentTask || { id: parentTaskId, title: parentTaskTitle, category: 'study', difficulty: 'easy', estimatedMinutes: 15 });
  showToast('已重置任务链，请重新拆分 ↩');
}

function updateSpinLock() {
  const chainActive   = !!getActiveChain();
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
  const chain = getActiveChain();
  if (!chain) { banner.classList.add('hidden'); return; }

  const total = chain.steps.length;
  const doneCount = chain.steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
  const currentStep = chain.steps[chain.currentStepIndex];

  // Guard: if index is past all steps, finish instead of showing stale banner
  if (!currentStep || (currentStep.status !== 'active' && currentStep.status !== 'pending')) {
    const hasMore = chain.steps.some(s => s.status === 'pending' || s.status === 'active');
    if (!hasMore) {
      console.warn('[Chain] updateChainBanner: no active/pending steps — finishing chain');
      finishChain();
      return;
    }
  }

  document.getElementById('chain-banner-title').textContent =
    chain.parentTaskTitle + ' (' + doneCount + '/' + total + ')';
  banner.classList.remove('hidden');
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
  if (!splitTaskTarget) { cancelSplit(); return; }
  const source = data.meta.lockedByTaskId ? 'procrastination' : 'manual';
  const chain  = createTaskChain(splitTaskTarget, names.map(title => ({ title, estimatedMinutes: 15 })), source);
  if (!chain) { cancelSplit(); return; }
  saveData(); renderAll();
  document.getElementById('split-modal').classList.add('hidden');
  splitTaskTarget = null; aiGeneratedSubtasks = null;
  showChainMode();
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
    data.meta.lockedByTaskId = null; // subtasks are now in the spinner — release lock
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
document.getElementById('chain-done-btn').addEventListener('click',    () => advanceChainStep('completed'));
document.getElementById('chain-skip-btn').addEventListener('click',    () => advanceChainStep('skipped'));
document.getElementById('chain-abandon-btn').addEventListener('click', abandonChain);

function onTaskChainClick(e) {
  console.log('[Chain] banner/btn clicked — checking active chain');
  try {
    const chain = getActiveChain();
    if (!chain) {
      console.warn('[Chain] task-chain clicked but no active chain — hiding banner');
      updateChainBanner();
      return;
    }
    console.log('[Chain] active chain found:', chain.id, 'status:', chain.status, 'steps:', chain.steps.length);
    // Defensive: if no actionable steps remain, finish
    const hasMore = chain.steps.some(s => s.status === 'pending' || s.status === 'active');
    if (!hasMore) {
      console.warn('[Chain] task-chain clicked but no pending/active steps — finishing chain');
      finishChain();
      return;
    }
    showChainMode();
  } catch (err) {
    console.error('[Chain] onTaskChainClick error:', err.message, err.stack);
  }
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

// ── Study Minutes & Skip Tickets ───────────────────────────────────────────
function addStudyMinutes(minutes) {
  if (!minutes || minutes <= 0) return;
  data.meta.minutesToday = (data.meta.minutesToday || 0) + minutes;
  data.meta.totalMinutes = (data.meta.totalMinutes || 0) + minutes;
  const prevEarned = data.meta.skipTicketsEarned || 0;
  const newEarned  = Math.floor(data.meta.totalMinutes / 60);
  const gained = newEarned - prevEarned;
  if (gained > 0) {
    data.meta.skipTicketsEarned = newEarned;
    data.meta.skipTickets = (data.meta.skipTickets || 0) + gained;
    showToast(`获得 ${gained} 张跳过券！🎫`);
    checkAchievements();
  }
  saveData();
  renderAll();
}

// ── Render: Daily Card ─────────────────────────────────────────────────────
function renderDailyCard() {
  const el = document.getElementById('daily-card');
  if (!el) return;
  const d = new Date();
  const dateStr = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  const mins  = data.meta.minutesToday || 0;
  const hours = Math.floor(mins / 60);
  const remM  = mins % 60;
  const timeStr = hours > 0 ? `${hours}小时${remM}分` : `${remM}分钟`;
  const tickets   = data.meta.skipTickets         || 0;
  const doneTasks = data.meta.tasksCompletedToday || 0;
  el.innerHTML = `
    <div class="panel-header">
      <h2>📅 今日概览</h2>
      <span class="panel-hint">${dateStr}</span>
    </div>
    <div class="daily-card-grid">
      <div class="daily-card-item">
        <span class="daily-card-num">${doneTasks}</span>
        <span class="daily-card-lbl">任务完成</span>
      </div>
      <div class="daily-card-item">
        <span class="daily-card-num">${timeStr}</span>
        <span class="daily-card-lbl">专注时间</span>
      </div>
      <div class="daily-card-item">
        <span class="daily-card-num">🎫 ${tickets}</span>
        <span class="daily-card-lbl">跳过券</span>
      </div>
    </div>
  `;
}

// ── Render: Achievements ───────────────────────────────────────────────────
function renderAchievements() {
  const el = document.getElementById('achievements-panel');
  if (!el) return;
  const ach = data.meta.achievements || {};
  const ACHIEVEMENTS = [
    { key: 'firstTask', icon: '🌱', name: '第一步',      desc: '完成第一个任务' },
    { key: 'focus60',   icon: '⏱️', name: '专注达人',    desc: '累计专注60分钟' },
    { key: 'focus300',  icon: '🔥', name: '时间管理大师', desc: '累计专注300分钟' },
    { key: 'tickets3',  icon: '🎫', name: '节制',        desc: '同时持有3张跳过券' },
    { key: 'ironWill',  icon: '💪', name: '铁血意志',    desc: '完成10个任务且从未用过跳过券' },
    { key: 'sprint5',   icon: '🏃', name: '冲刺',        desc: '单日完成5个任务' },
    { key: 'habit7',    icon: '🗓️', name: '习惯养成',    desc: '累计使用7天' },
  ];
  const unlocked = ACHIEVEMENTS.filter(a => ach[a.key]).length;
  el.innerHTML = `
    <div class="panel-header">
      <h2>🏅 成就</h2>
      <span class="panel-hint">${unlocked}/${ACHIEVEMENTS.length}</span>
    </div>
    <div class="achievements-grid">
      ${ACHIEVEMENTS.map(a => `
        <div class="achievement-item ${ach[a.key] ? 'unlocked' : 'locked'}">
          <div class="achievement-tooltip">${esc(a.desc)}</div>
          <span class="achievement-icon">${a.icon}</span>
          <span class="achievement-name">${a.name}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function checkAchievements() {
  if (!data.meta.achievements) return;
  const ach  = data.meta.achievements;
  const prev = { ...ach };
  const total   = data.meta.tasksCompletedTotal || 0;
  const today   = data.meta.tasksCompletedToday || 0;
  const mins    = data.meta.totalMinutes        || 0;
  const tickets = data.meta.skipTickets         || 0;
  const used    = data.meta.skipTicketsUsed     || 0;
  const days    = data.meta.activeDays          || 1;

  if (!ach.firstTask && total >= 1)               ach.firstTask = true;
  if (!ach.focus60   && mins  >= 60)              ach.focus60   = true;
  if (!ach.focus300  && mins  >= 300)             ach.focus300  = true;
  if (!ach.tickets3  && tickets >= 3)             ach.tickets3  = true;
  if (!ach.ironWill  && total >= 10 && used === 0) ach.ironWill = true;
  if (!ach.sprint5   && today >= 5)               ach.sprint5   = true;
  if (!ach.habit7    && days  >= 7)               ach.habit7    = true;

  const NAMES = {
    firstTask: '第一步 🌱', focus60: '专注达人 ⏱️', focus300: '时间管理大师 🔥',
    tickets3: '节制 🎫', ironWill: '铁血意志 💪', sprint5: '冲刺 🏃', habit7: '习惯养成 🗓️'
  };
  Object.keys(ach).forEach(key => {
    if (!prev[key] && ach[key]) showToast('成就解锁：' + NAMES[key] + ' 🏅');
  });
  saveData();
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
  const done          = log.filter(e => e.action === 'task_done');
  const procrastEvents = log.filter(e => e.action === 'task_procrastinated');
  const completed     = done.length;
  const procrastinated = procrastEvents.length;

  // Start success rate: completed / (completed + procrastinated), formatted as %
  const total = completed + procrastinated;
  const successRate = total === 0 ? null : Math.round((completed / total) * 100);

  // Most procrastinated category
  const catCounts = {};
  procrastEvents.forEach(e => {
    const cat = e.category || 'study';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  const topProcrastCategory = Object.keys(catCounts).length === 0 ? null
    : Object.keys(catCounts).reduce((a, b) => catCounts[a] >= catCounts[b] ? a : b);

  return {
    completed,
    estimatedMinutes: done.reduce((s, e) => s + (e.estimatedMinutes || 0), 0),
    procrastinated,
    skipped:        log.filter(e => e.action === 'task_skipped').length,
    rewardsBanked:  log.filter(e => e.action === 'reward_banked').length,
    rewardsUsed:    log.filter(e => e.action === 'reward_used').length,
    chainsCompleted: log.filter(e => e.action === 'chain_completed').length,
    procrastinationRecoveries: log.filter(e => e.action === 'chain_completed' && e.source === 'procrastination').length,
    successRate,
    topProcrastCategory,
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
    '<div class="stats-row2">' +
    (s.successRate !== null ? '<span>🎯 启动率: ' + s.successRate + '%</span>' : '') +
    (s.procrastinationRecoveries > 0 ? '<span>💪 拖延恢复: ' + s.procrastinationRecoveries + '</span>' : '') +
    (s.topProcrastCategory ? '<span>⚠️ 最拖延: ' + (CATEGORY_LABELS[s.topProcrastCategory] || s.topProcrastCategory) + '</span>' : '') +
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
  const tickets   = data.meta ? (data.meta.skipTickets || 0) : 0;
  document.getElementById('stats-display').innerHTML =
    `${active} 个任务待完成 · ${completed} 个已完成<br>` +
    `<span class="skip-cards-stat">🎫 跳过券: ${tickets} 张</span>`;
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
