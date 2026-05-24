const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let dataFilePath;

function loadApiKey() {
  try {
    const cfgPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (cfg.anthropicApiKey) return cfg.anthropicApiKey;
    }
  } catch (e) { /* fall through to env */ }
  return process.env.ANTHROPIC_API_KEY || null;
}

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const SPLIT_SYSTEM_PROMPT = `You are a productivity assistant helping a student break down tasks they are procrastinating on. Given a task title, category, difficulty, and estimated duration, generate 3-5 concrete, actionable subtasks that together complete the original task. Each subtask should be small enough to feel approachable (5-20 minutes each).

Respond ONLY with a valid JSON array. No explanation, no markdown fences, no text outside the JSON.

Format exactly:
[{"title":"subtask name in Chinese","estimatedMinutes":10},{"title":"...","estimatedMinutes":15}]

Rules:
- All subtask titles must be in Chinese
- estimatedMinutes must be an integer between 5 and 30
- Generate between 3 and 5 subtasks
- Each subtask must be specific and actionable
- The subtasks together should cover the full scope of the original task`;

const defaultData = {
  rewards: [
    { id: 1, title: '看一集喜欢的剧', durationMinutes: 45, weight: 1, banked: 0, active: true },
    { id: 2, title: '打游戏1小时',     durationMinutes: 60, weight: 1, banked: 0, active: true },
    { id: 3, title: '买一杯奶茶',      durationMinutes: 30, weight: 1, banked: 0, active: true }
  ],
  tasks: [
    { id: 1, title: '背单词10个',    category: 'study',   difficulty: 'easy',   estimatedMinutes: 15, weight: 2, repeatable: true, frequency: 'daily',  completed: false, completedCount: 0, procrastinatedCount: 0, skippedCount: 0, activeInCurrentRound: true },
    { id: 2, title: '做题30分钟',    category: 'study',   difficulty: 'medium', estimatedMinutes: 30, weight: 2, repeatable: true, frequency: 'daily',  completed: false, completedCount: 0, procrastinatedCount: 0, skippedCount: 0, activeInCurrentRound: true },
    { id: 3, title: '读书20页',      category: 'study',   difficulty: 'easy',   estimatedMinutes: 20, weight: 2, repeatable: true, frequency: 'daily',  completed: false, completedCount: 0, procrastinatedCount: 0, skippedCount: 0, activeInCurrentRound: true }
  ]
};

function createWindow() {
  dataFilePath = path.join(app.getPath('userData'), 'spinner-data.json');

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#0f0f23',
    show: false,
    title: '学习激励转盘'
  });

  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('split-task', async (_, taskData) => {
  const apiKey = loadApiKey();
  if (!apiKey) return { error: '未找到 API Key，请在 config.json 中配置 anthropicApiKey' };

  const userMsg = `请帮我拆分这个任务：
任务名称：${taskData.title}
分类：${taskData.category}
难度：${taskData.difficulty}
预计时间：${taskData.estimatedMinutes} 分钟`;

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SPLIT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }]
  });

  try {
    const result = await httpsPost({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }, requestBody);

    if (result.status !== 200) {
      const msg = result.body && result.body.error ? result.body.error.message : `HTTP ${result.status}`;
      return { error: msg };
    }

    const text = result.body.content && result.body.content[0] && result.body.content[0].text;
    if (!text) return { error: '无效的 API 响应' };

    const subtasks = JSON.parse(text.trim());
    if (!Array.isArray(subtasks) || subtasks.length === 0) return { error: 'AI 返回格式错误' };
    return { subtasks };
  } catch (e) {
    console.error('split-task error:', e);
    return { error: e.message || '网络请求失败' };
  }
});

ipcMain.handle('load-data', () => {
  try {
    if (fs.existsSync(dataFilePath)) {
      return JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load data:', e);
  }
  return defaultData;
});

ipcMain.handle('save-data', (_, data) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to save data:', e);
    return false;
  }
});
