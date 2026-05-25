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

// ── Keyword detection ─────────────────────────────────────────────────────
function detectTaskKeywords(title, fallbackCategory) {
  const t = (title || '').trim();

  const patterns = [
    { re: /复习|review/i,                          taskType: 'review',     cat: 'study'   },
    { re: /背单词|单词|vocab|memorize|word/i,       taskType: 'vocab',      cat: 'study'   },
    { re: /做题|练习题|题目|problem|exercise/i,      taskType: 'problem',    cat: 'study'   },
    { re: /写代码|代码|code|project/i,              taskType: 'code',       cat: 'project' },
    { re: /写作业|作业|assignment|homework/i,        taskType: 'assignment', cat: 'study'   },
    { re: /整理|clean up|clean|organize/i,          taskType: 'organize',   cat: 'life'    },
    { re: /发邮件|邮件|email/i,                     taskType: 'email',      cat: 'life'    },
  ];

  for (const { re, taskType, cat } of patterns) {
    if (re.test(t)) {
      const target = t.replace(re, '').replace(/\s+/g, ' ').trim();
      return { taskType, target: target || t, category: fallbackCategory || cat };
    }
  }
  return { taskType: 'generic', target: t, category: fallbackCategory || 'study' };
}

// ── Local template generator ───────────────────────────────────────────────
function generateLocalSplit(detected, originalTask) {
  const { taskType, target, category } = detected;
  const tgt = target || originalTask.title || '';
  const mk  = (title, mins) => ({ title, estimatedMinutes: mins, difficulty: 'easy', category });

  let starterTask, rawSubtasks;

  switch (taskType) {
    case 'review':
      starterTask  = mk('拿好 iPad、电脑、笔记，打开 ' + tgt + ' 的教材/PPT', 3);
      rawSubtasks  = [
        mk('快速浏览 ' + tgt + ' 的标题和小节', 5),
        mk('复习前半部分内容，标出不懂的地方', 10),
        mk('写下 3 个 ' + tgt + ' 的核心概念', 8),
        mk('不看资料，回忆一遍主要内容', 5),
      ];
      break;

    case 'vocab':
      starterTask  = mk('打开单词本和笔记' + (tgt ? '，找到 ' + tgt : '') + '，准备好笔', 2);
      rawSubtasks  = [
        mk('列出需要背的单词清单', 5),
        mk('第一遍：看单词和释义', 8),
        mk('第二遍：遮住释义默写', 8),
        mk('重复错误单词再巩固', 5),
      ];
      break;

    case 'problem':
      starterTask  = mk('打开 ' + (tgt || '题目') + ' 文件，准备好草稿纸', 2);
      rawSubtasks  = [
        mk('读懂第一题题意', 5),
        mk('完成前几道题', 10),
        mk('完成剩余题目', 10),
        mk('检查并订正错误', 5),
      ];
      break;

    case 'code':
      starterTask  = mk('打开代码编辑器，创建 ' + (tgt || '项目') + ' 文件', 3);
      rawSubtasks  = [
        mk('明确 ' + (tgt || '项目') + ' 的需求，列出实现步骤', 5),
        mk('搭建基本框架结构', 10),
        mk('实现核心功能', 15),
        mk('测试并修复问题', 10),
      ];
      break;

    case 'assignment':
      starterTask  = mk('打开 ' + (tgt || '作业') + ' 文件，浏览全部要求', 3);
      rawSubtasks  = [
        mk('拆解 ' + (tgt || '作业') + ' 的各部分要求', 5),
        mk('完成第一部分', 10),
        mk('完成第二部分', 10),
        mk('检查完整性并提交', 5),
      ];
      break;

    case 'organize':
      starterTask  = mk('准备好整理 ' + (tgt || '材料') + ' 所需的工具', 2);
      rawSubtasks  = [
        mk('清点需要整理的内容', 5),
        mk('分类归档第一批', 10),
        mk('分类归档第二批', 10),
        mk('检查整理结果', 5),
      ];
      break;

    case 'email':
      starterTask  = mk('打开邮件客户端，找到收件人地址', 2);
      rawSubtasks  = [
        mk('列出邮件要点', 5),
        mk('写邮件正文', 8),
        mk('检查语法和内容', 5),
        mk('确认并发送', 2),
      ];
      break;

    default:
      starterTask  = mk('准备好所需材料，坐到工位', 2);
      rawSubtasks  = [
        mk('准备材料', 5),
        mk('做5分钟', 5),
        mk('继续做10分钟', 10),
        mk('快速检查结果', 5),
      ];
  }

  return { taskType, target: tgt, starterTask, subtasks: rawSubtasks };
}

ipcMain.handle('split-task', async (_, taskData) => {
  const detected = detectTaskKeywords(taskData.title, taskData.category);
  const local    = generateLocalSplit(detected, taskData);

  const apiKey = loadApiKey();
  if (!apiKey) {
    return { ...local, source: 'local' };
  }

  // API key present: use AI for subtasks, keep local detection + starterTask
  const userMsg = '请帮我拆分这个任务：\n任务名称：' + taskData.title +
    '\n分类：' + taskData.category +
    '\n难度：' + taskData.difficulty +
    '\n预计时间：' + taskData.estimatedMinutes + ' 分钟';

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

    if (result.status === 200) {
      const text = result.body.content && result.body.content[0] && result.body.content[0].text;
      if (text) {
        const aiSubtasks = JSON.parse(text.trim());
        if (Array.isArray(aiSubtasks) && aiSubtasks.length > 0) {
          const enhanced = aiSubtasks.map(st => ({
            title: st.title,
            estimatedMinutes: st.estimatedMinutes || 10,
            difficulty: 'easy',
            category: detected.category
          }));
          return { ...local, subtasks: enhanced, source: 'ai' };
        }
      }
    }
  } catch (e) {
    console.error('AI split failed, using local:', e);
  }

  return { ...local, source: 'local' };
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
