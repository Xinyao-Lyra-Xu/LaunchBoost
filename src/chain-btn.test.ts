// @vitest-environment node
/**
 * 诊断「继续 →」按钮 (#task-chain-btn) 点不开的原因。
 *
 * 每个 test 都独立启动一个 jsdom + renderer.js 环境，
 * 用特定的 chain 数据状态触发场景，断言 banner / modal 的可见性。
 *
 * 运行：npx vitest run src/chain-btn.test.ts
 */

import { describe, test, expect, vi } from 'vitest'
import { JSDOM, VirtualConsole } from 'jsdom'
import * as fs   from 'node:fs'
import * as path from 'node:path'

// ── 读源文件（仅一次） ─────────────────────────────────────────────────────

const ROOT        = path.resolve(__dirname, '..')
const INDEX_HTML  = fs.readFileSync(path.join(ROOT, 'index.html'),  'utf-8')
const RENDERER_JS = fs.readFileSync(path.join(ROOT, 'renderer.js'), 'utf-8')

// ── 数据结构类型 ──────────────────────────────────────────────────────────

type StepStatus  = 'active' | 'pending' | 'completed' | 'skipped' | 'done'
type ChainStatus = 'active' | 'completed' | 'cancelled'

interface Step {
  id: string; chainId: string; parentTaskId: string
  title: string; description: string; estimatedMinutes: number
  status: StepStatus; order: number
  createdAt: string; completedAt: string | null
}

interface Chain {
  id: string; parentTaskId: string; parentTaskTitle: string
  source: string; status: ChainStatus; currentStepIndex: number
  steps: Step[]; createdAt: string; completedAt: string | null
}

// ── Fixture helpers ───────────────────────────────────────────────────────

function makeStep(
  id: string, title: string, status: StepStatus, order: number,
  extra: Partial<Step> = {}
): Step {
  return {
    id, chainId: 'c1', parentTaskId: 't1',
    title, description: '', estimatedMinutes: 20, status, order,
    createdAt: '2025-01-01T00:00:00Z', completedAt: null,
    ...extra,
  }
}

/** 默认 3 步链：step[0]=active, step[1-2]=pending */
function makeChain(overrides: Partial<Chain> = {}): Chain {
  return {
    id: 'c1', parentTaskId: 't1', parentTaskTitle: '写大论文',
    source: 'ai', status: 'active', currentStepIndex: 0,
    createdAt: '2025-01-01T00:00:00Z', completedAt: null,
    steps: [
      makeStep('s1', '文献调研', 'active',  0),
      makeStep('s2', '写大纲',   'pending', 1),
      makeStep('s3', '写正文',   'pending', 2),
    ],
    ...overrides,
  }
}

/** 构造 window.api.loadData() 返回的完整 data 对象 */
function makeData(chains: Chain[] = []) {
  const active = chains.find(c => c.status === 'active')
  return {
    rewards: [],
    tasks: [{
      id: 't1', title: '写大论文', category: 'study', difficulty: 'hard',
      estimatedMinutes: 120, weight: 1, repeatable: false, frequency: 'once',
      completed: false, completedCount: 0, procrastinatedCount: 0,
      skippedCount: 0, activeInCurrentRound: !active,
    }],
    meta: {
      chains,
      activeChainId:       active?.id ?? null,
      lockedByTaskId:      null,
      pendingTaskResultId: null,
      skipTickets: 0, studyMinutes: 0, sessionCount: 0,
      chainCompletionCount: 0, stuckCount: 0, activityLog: [],
      achievements: {},
      lastOpenDate: '2025-01-01',
      stats: {
        today:   { sessions: 0, minutes: 0, tasks: 0 },
        week:    { sessions: 0, minutes: 0, tasks: 0 },
        month:   { sessions: 0, minutes: 0, tasks: 0 },
        allTime: { sessions: 0, minutes: 0, tasks: 0 },
      },
    },
  }
}

// ── 环境工厂 ──────────────────────────────────────────────────────────────

/**
 * 用指定的 initialData 启动一个完整的 jsdom + renderer.js 环境。
 * 等待 init() 中的 Promise 链 resolve 后返回。
 */
async function boot(initialData: ReturnType<typeof makeData>) {
  const vc   = new VirtualConsole()
  const logs: string[] = []
  vc.on('log',   m => logs.push('[L] ' + m))
  vc.on('warn',  m => logs.push('[W] ' + m))
  vc.on('error', m => logs.push('[E] ' + m))

  const dom = new JSDOM(INDEX_HTML, {
    url: 'file:///app/index.html',
    virtualConsole: vc,
    runScripts: 'outside-only',
  })
  const win = dom.window as any

  // Canvas mock（jsdom 没有 GPU 上下文）
  const fakeCtx = {
    clearRect:()=>{}, beginPath:()=>{}, arc:()=>{}, fill:()=>{},
    stroke:()=>{}, moveTo:()=>{}, lineTo:()=>{}, closePath:()=>{},
    save:()=>{}, restore:()=>{}, translate:()=>{}, rotate:()=>{}, scale:()=>{},
    fillText:()=>{}, measureText:()=>({ width: 60 }),
    createLinearGradient:()=>({ addColorStop:()=>{} }),
    createRadialGradient:()=>({ addColorStop:()=>{} }),
    fillStyle:'', strokeStyle:'', lineWidth:0, font:'', textAlign:'',
    textBaseline:'', globalAlpha:1, shadowBlur:0, shadowColor:'',
    shadowOffsetX:0, shadowOffsetY:0,
  }
  win.HTMLCanvasElement.prototype.getContext = () => fakeCtx
  win.requestAnimationFrame  = (cb: any) => { setTimeout(cb, 0); return 0 }
  win.cancelAnimationFrame   = () => {}

  // Electron preload bridge mock
  win.api = {
    loadData:  vi.fn().mockResolvedValue(initialData),
    saveData:  vi.fn().mockResolvedValue(undefined),
    splitTask: vi.fn().mockResolvedValue([]),
  }

  // 加载 renderer.js（末尾调用 init()）
  win.eval(RENDERER_JS)

  // 等待 init() 内的 Promise 链 resolve（loadData + renderAll + setTimeout 50ms）
  await new Promise(r => setTimeout(r, 120))

  const $ = (id: string): HTMLElement | null => win.document.getElementById(id)
  const hidden = (id: string) => !!$( id)?.classList?.contains('hidden')

  return { $, hidden, logs, win }
}

// ═══════════════════════════════════════════════════════════════════════════
// Group 1：Banner 可见性 — 按钮到底有没有显示出来？
// ═══════════════════════════════════════════════════════════════════════════
describe('Banner 可见性', () => {

  test('meta.chains 为空 → banner 隐藏', async () => {
    const { hidden } = await boot(makeData([]))
    expect(hidden('chain-banner')).toBe(true)
  })

  test('唯一的链 status=completed → banner 隐藏', async () => {
    const { hidden } = await boot(makeData([makeChain({ status: 'completed' })]))
    expect(hidden('chain-banner')).toBe(true)
  })

  test('唯一的链 status=cancelled → banner 隐藏', async () => {
    const { hidden } = await boot(makeData([makeChain({ status: 'cancelled' })]))
    expect(hidden('chain-banner')).toBe(true)
  })

  test('active 链有 pending 步骤 → banner 可见', async () => {
    const { hidden } = await boot(makeData([makeChain()]))
    expect(hidden('chain-banner')).toBe(false)
  })

  test('banner 标题包含父任务名与进度', async () => {
    const { $ } = await boot(makeData([makeChain()]))
    const title = $('chain-banner-title')?.textContent ?? ''
    expect(title).toContain('写大论文')
    expect(title).toContain('0/3')
  })

  // ── 最高概率 Bug ──────────────────────────────────────────────────────
  test(
    '[BUG?] 链存在 task.chain 而非 meta.chains 时 → getActiveChain() 返回 null → banner 永久隐藏',
    async () => {
      const data = makeData([])                      // meta.chains = []
      ;(data as any).tasks[0].chain        = makeChain()   // 错误位置
      ;(data as any).tasks[0].lockedByChain = true
      const { hidden } = await boot(data)
      // getActiveChain() 只查 data.meta.chains → 找不到 → banner 隐藏
      // 如果这个断言 PASS，说明该 bug 场景确实会导致按钮消失
      expect(hidden('chain-banner')).toBe(true)
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// Group 2：点击按钮 → 弹窗打开
// ═══════════════════════════════════════════════════════════════════════════
describe('点击 继续 → 开弹窗', () => {

  test('[happy path] 点击按钮后 chain-mode-modal 变为可见', async () => {
    const { $, hidden } = await boot(makeData([makeChain()]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(false)
  })

  test('弹窗内容正确：步骤标题、进度、父任务', async () => {
    const { $, hidden } = await boot(makeData([makeChain()]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(false)
    expect($('chain-step-title')?.textContent).toBe('文献调研')
    expect($('chain-progress')?.textContent).toContain('步骤 1 / 3')
    expect($('chain-parent-title')?.textContent).toBe('写大论文')
  })

  test('计时器显示初始值 00:00', async () => {
    const { $ } = await boot(makeData([makeChain()]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect($('chain-timer-display')?.textContent).toBe('00:00')
  })

  test('点击 banner 整体（非按钮）也能打开弹窗', async () => {
    const { $, hidden } = await boot(makeData([makeChain()]))
    $('chain-banner')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(false)
  })

  test('stopPropagation 有效：点一次按钮不会让步骤意外推进', async () => {
    const { $, hidden } = await boot(makeData([makeChain()]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    // 若 showChainMode 被调用两次，step[0] 会被 activate 两次，但不会推进
    // 关键是弹窗显示的仍是第一步，不是第二步
    expect($('chain-step-title')?.textContent).toBe('文献调研')
    expect($('chain-progress')?.textContent).toContain('步骤 1 / 3')
  })

  test('banner 上点击不会触发 task-chain-btn 的 stopPropagation 意外阻断', async () => {
    // chain-banner 有自己的 click → onTaskChainClick
    // task-chain-btn 的 e.stopPropagation() 只阻止事件冒泡到 banner
    // 直接点击 banner（不经过 btn）应正常触发
    const { $, hidden, win } = await boot(makeData([makeChain()]))
    const bannerClickEvent = new (win as any).MouseEvent('click', { bubbles: true })
    $('chain-banner')!.dispatchEvent(bannerClickEvent)
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group 3：showChainMode() 边界条件
// ═══════════════════════════════════════════════════════════════════════════
describe('showChainMode() 边界条件', () => {

  test('currentStepIndex 指向已完成的步骤 → 自动纠正到第一个 pending 步', async () => {
    const chain = makeChain({
      currentStepIndex: 0,
      steps: [
        makeStep('s1', '文献调研', 'completed', 0, { completedAt: '2025-01-01T01:00:00Z' }),
        makeStep('s2', '写大纲',   'pending',   1),
        makeStep('s3', '写正文',   'pending',   2),
      ],
    })
    const { $, hidden } = await boot(makeData([chain]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(false)
    // 应该跳到 '写大纲' 而不是已完成的 '文献调研'
    expect($('chain-step-title')?.textContent).toBe('写大纲')
  })

  test('所有步骤都已完成 → 调用 finishChain，弹窗不打开，banner 消失', async () => {
    const chain = makeChain({
      steps: [
        makeStep('s1', '步骤一', 'completed', 0, { completedAt: '2025-01-01T01:00:00Z' }),
        makeStep('s2', '步骤二', 'completed', 1, { completedAt: '2025-01-01T02:00:00Z' }),
      ],
    })
    const { hidden } = await boot(makeData([chain]))
    // updateChainBanner() 发现无 pending/active 步骤 → 调用 finishChain()
    expect(hidden('chain-banner')).toBe(true)
    expect(hidden('chain-mode-modal')).toBe(true)
  })

  test('chain.steps 为空 → showChainMode 内调用 finishChain，弹窗不打开', async () => {
    const chain = makeChain({ steps: [] })
    const { hidden } = await boot(makeData([chain]))
    expect(hidden('chain-mode-modal')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group 4：migrateChain() 的 currentStepIndex 计算 Bug
// ═══════════════════════════════════════════════════════════════════════════
describe('migrateChain() — currentStepIndex 计算', () => {

  /**
   * Bug 场景：旧数据中 currentStepIndex 字段缺失。
   * migrateChain 用 reduce 计算：
   *   lastDoneIdx = 最后一个 status !== 'pending' 的步骤的索引
   *   currentStepIndex = min(lastDoneIdx + 1, steps.length - 1)
   *
   * 对于新链 [active, pending, pending]：
   *   step[0] 是 'active'（不是 pending） → lastDoneIdx = 0
   *   currentStepIndex = min(1, 2) = 1   ← 错了！应该是 0
   *
   * 然后 migrateChain 还会把 step[1] 也标为 active（因为是 currentStep）
   * 结果：step[0] 和 step[1] 都是 active，但弹窗显示 step[1]
   */
  test('currentStepIndex 缺失（旧数据）→ 迁移后正确显示第一个 active 步骤', async () => {
    const chain = makeChain()
    // 模拟旧数据：没有 currentStepIndex 字段
    const chainWithoutIdx = { ...chain } as any
    delete chainWithoutIdx.currentStepIndex

    const { $, hidden } = await boot(makeData([chainWithoutIdx]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(false)

    // 修复前：旧 reduce 逻辑把 'active' 当作"已完成"，导致 currentStepIndex=1，显示 '写大纲'
    // 修复后：findIndex('active') 正确找到 step[0]，显示 '文献调研'
    expect($('chain-step-title')?.textContent).toBe('文献调研')
  })

  test('旧 status="done" 被迁移为 "completed" → 步骤不再被当作 active', async () => {
    const chain = makeChain({
      steps: [
        // 用 any 绕过类型：旧数据里 status 可能是 'done'
        makeStep('s1', '步骤一', 'done' as any, 0, { completedAt: '2025-01-01T01:00:00Z' }),
        makeStep('s2', '步骤二', 'pending',      1),
      ],
    })
    const { $, hidden } = await boot(makeData([chain]))
    // migrateChain 把 'done' → 'completed'，updateChainBanner 找到 step[1] 作为当前步
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(false)
    expect($('chain-step-title')?.textContent).toBe('步骤二')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group 5：步骤推进流程
// ═══════════════════════════════════════════════════════════════════════════
describe('步骤推进（advanceChainStep）', () => {

  test('点击「完成这一步」后弹窗自动跳到下一步', async () => {
    const { $, hidden } = await boot(makeData([makeChain()]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect($('chain-step-title')?.textContent).toBe('文献调研')

    $('chain-done-btn')!.click()
    await new Promise(r => setTimeout(r, 50))
    // 弹窗应自动重新打开，显示第二步
    expect(hidden('chain-mode-modal')).toBe(false)
    expect($('chain-step-title')?.textContent).toBe('写大纲')
    expect($('chain-progress')?.textContent).toContain('步骤 2 / 3')
  })

  test('完成最后一步 → 弹窗关闭，banner 消失，父任务解锁', async () => {
    const chain = makeChain({
      steps: [ makeStep('s1', '唯一步骤', 'active', 0) ],
    })
    const { $, hidden } = await boot(makeData([chain]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    $('chain-done-btn')!.click()
    await new Promise(r => setTimeout(r, 80))  // finishChain + renderAll

    expect(hidden('chain-mode-modal')).toBe(true)
    expect(hidden('chain-banner')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group 6：关闭与重开
// ═══════════════════════════════════════════════════════════════════════════
describe('关闭弹窗 / 重新打开', () => {

  test('点「先关闭」→ 弹窗消失，banner 仍然可见（链还在）', async () => {
    const { $, hidden } = await boot(makeData([makeChain()]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    $('chain-close-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(true)
    expect(hidden('chain-banner')).toBe(false)  // 链还在，banner 应可见
  })

  test('关闭后再次点「继续 →」可以重新打开弹窗', async () => {
    const { $, hidden } = await boot(makeData([makeChain()]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    $('chain-close-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(false)
  })

  test('点背景 (backdrop) 也能关闭弹窗', async () => {
    const { $, hidden } = await boot(makeData([makeChain()]))
    $('task-chain-btn')!.click()
    await new Promise(r => setTimeout(r, 30))
    $('chain-mode-backdrop')!.click()
    await new Promise(r => setTimeout(r, 30))
    expect(hidden('chain-mode-modal')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Group 7：DOM 接线完整性（保护所有 renderer.js 读写的 ID）
// ═══════════════════════════════════════════════════════════════════════════
describe('DOM 元素接线', () => {
  test('所有 renderer.js 使用的 ID 都存在于 DOM 中', async () => {
    const { $ } = await boot(makeData([]))
    const required = [
      'chain-banner', 'chain-banner-title', 'task-chain-btn',
      'chain-mode-modal', 'chain-mode-backdrop',
      'chain-parent-title', 'chain-progress-bar', 'chain-progress',
      'chain-step-title',   'chain-step-mins',
      'chain-encourage',    'chain-timer-display',
      'chain-timer-btn',    'chain-done-btn',
      'chain-close-btn',    'chain-abandon-btn', 'chain-skip-btn',
    ]
    for (const id of required) {
      expect($( id), `#${id} 不存在`).not.toBeNull()
    }
  })
})

