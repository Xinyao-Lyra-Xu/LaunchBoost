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
      ? t.activeInCurrentRound : !wasCompleted
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
    document.getElementById('spin-btn').disabled = false;
    showResult(winner);
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
      <button class="btn-procrastinate" id="procrastinate-btn">拖延了 😅</button>
      <button class="btn-skip" id="skip-card-btn" ${skipCount === 0 ? 'disabled' : ''}>使用跳过卡 🃏 (${skipCount})</button>
    `;
    document.getElementById('complete-task-btn').addEventListener('click', completeCurrentTask);
    document.getElementById('procrastinate-btn').addEventListener('click', procrastinateCurrentTask);
    document.getElementById('skip-card-btn').addEventListener('click', skipCurrentTask);
  }
  document.getElementById('result-modal').classList.remove('hidden');
}

function closeResult() {
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
    saveData();
    renderAll();
  }
  bumpStat('completedToday', 'totalCompleted');
  closeResult();
  showToast('任务完成！继续加油 🎉');
}

function procrastinateCurrentTask() {
  if (!currentResult || currentResult.type !== 'task') return;
  const task = data.tasks.find(t => t.id === currentResult.item.id);
  if (task) {
    task.procrastinatedCount = (task.procrastinatedCount || 0) + 1;
    saveData();
  }
  bumpStat('procrastinatedToday', 'totalProcrastinated');
  afterProcrastination = true;

  const diff = task ? task.difficulty : 'easy';
  if (diff === 'medium' || diff === 'hard') {
    closeResult();
    openSplitModal(task);
  } else {
    renderAll();
    closeResult();
    showToast('已记录拖延，下次简单任务概率更高 💪');
  }
}

function skipCurrentTask() {
  if (!currentResult || currentResult.type !== 'task') return;
  if (!data.meta.skipCards || data.meta.skipCards.count <= 0) return;
  data.meta.skipCards.count--;
  const task = data.tasks.find(t => t.id === currentResult.item.id);
  if (task) {
    task.skippedCount        = (task.skippedCount || 0) + 1;
    task.activeInCurrentRound = false;
  }
  bumpStat('skippedToday', 'totalSkipped');
  saveData();
  renderAll();
  const remaining = data.meta.skipCards.count;
  closeResult();
  showToast(`任务已跳过！还剩 ${remaining} 张跳过卡 🃏`);
}

// ── Reward result actions ──────────────────────────────────────────────────
function useRewardNow() {
  closeResult();
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

// ── Split Modal ────────────────────────────────────────────────────────────
// States: 'choice' | 'loading' | 'results' | 'error' | 'manual'

function openSplitModal(task) {
  splitTaskTarget     = task;
  aiGeneratedSubtasks = null;
  document.getElementById('split-task-name').textContent = task ? task.title : '';
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
      renderAiResults(result.subtasks);
      setSplitState('results');
    }
  } catch (e) {
    document.getElementById('split-error-msg').textContent = e.message || '请求失败';
    setSplitState('error');
  }
}

function renderAiResults(subtasks) {
  const container = document.getElementById('split-ai-results');
  container.innerHTML = subtasks.map((st, i) => `
    <div class="ai-subtask-item">
      <span class="ai-subtask-num">${i + 1}.</span>
      <input type="text" class="edit-input ai-subtask-title"
             value="${esc(st.title)}" maxlength="40" data-idx="${i}">
      <input type="number" class="edit-input ai-subtask-min"
             value="${st.estimatedMinutes || 15}" min="1" max="120" data-idx="${i}">
      <span class="ai-subtask-unit">分</span>
    </div>
  `).join('');
}

function acceptAiSplit() {
  if (!splitTaskTarget) return;
  const titleEls = document.querySelectorAll('.ai-subtask-title');
  const minEls   = document.querySelectorAll('.ai-subtask-min');
  const subtasks = [];
  titleEls.forEach((el, i) => {
    const title = el.value.trim();
    if (title) subtasks.push({ title, estimatedMinutes: Math.max(1, parseInt(minEls[i].value) || 15) });
  });
  if (subtasks.length === 0) { cancelSplit(); return; }
  applySplit(subtasks);
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
    splitTaskTarget.activeInCurrentRound = false;
    subtasks.forEach(st => {
      data.tasks.push({
        id:                  nextId++,
        title:               st.title,
        category:            splitTaskTarget.category || 'study',
        difficulty:          'easy',
        estimatedMinutes:    st.estimatedMinutes || 15,
        weight:              2,
        repeatable:          false,
        frequency:           'once',
        completed:           false,
        completedCount:      0,
        procrastinatedCount: 0,
        skippedCount:        0,
        activeInCurrentRound: true
      });
    });
    saveData();
    renderAll();
  }
  document.getElementById('split-modal').classList.add('hidden');
  splitTaskTarget     = null;
  aiGeneratedSubtasks = null;
  showToast(`已拆分为 ${subtasks.length} 个子任务 ✂️`);
}

function cancelSplit() {
  document.getElementById('split-modal').classList.add('hidden');
  splitTaskTarget     = null;
  aiGeneratedSubtasks = null;
  renderAll();
  showToast('已记录拖延，下次简单任务概率更高 💪');
}

document.getElementById('split-backdrop').addEventListener('click', cancelSplit);
document.getElementById('split-ai-btn').addEventListener('click', requestAiSplit);
document.getElementById('split-manual-btn').addEventListener('click', () => {
  renderManualInputs(2);
  setSplitState('manual');
});
document.getElementById('split-no-btn').addEventListener('click', cancelSplit);
document.getElementById('split-accept-btn').addEventListener('click', acceptAiSplit);
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

// ── Render: Stats ──────────────────────────────────────────────────────────
function renderStats() {
  const el = document.getElementById('stats-panel-body');
  const s  = data.meta && data.meta.stats;
  if (!el || !s) return;
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item"><span class="stat-num">${s.completedToday}</span><span class="stat-lbl">今日完成</span></div>
      <div class="stat-item"><span class="stat-num">${s.procrastinatedToday}</span><span class="stat-lbl">今日拖延</span></div>
      <div class="stat-item"><span class="stat-num">${s.skippedToday}</span><span class="stat-lbl">今日跳过</span></div>
      <div class="stat-item"><span class="stat-num">${s.rewardsBankedToday}</span><span class="stat-lbl">今日存奖</span></div>
    </div>
    <div class="stats-total">
      累计: 完成 ${s.totalCompleted} · 拖延 ${s.totalProcrastinated} · 跳过 ${s.totalSkipped} · 存奖 ${s.totalRewardsBanked}
    </div>
  `;
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
    t.completed           = !t.completed;
    t.activeInCurrentRound = !t.completed;
    if (t.completed) t.completedCount = (t.completedCount || 0) + 1;
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
