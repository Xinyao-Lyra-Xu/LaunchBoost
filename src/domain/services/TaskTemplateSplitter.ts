import type { TaskCategory } from "../valueObjects/TaskCategory";

// ── Public types ─────────────────────────────────────────────────────────────

export type TaskType =
  | "review"
  | "vocab"
  | "problem"
  | "coding"
  | "assignment"
  | "email"
  | "organize"
  | "generic";

export interface ParsedTask {
  taskType: TaskType;
  target: string;
  category: TaskCategory;
}

export interface GeneratedTask {
  title: string;
  estimatedMinutes: number;
  difficulty: "easy";
  category: TaskCategory;
}

export interface SplitTaskOutput {
  taskType: TaskType;
  target: string;
  starterTask: GeneratedTask;
  subtasks: GeneratedTask[];
}

// ── Keyword detection ────────────────────────────────────────────────────────

interface Pattern {
  re: RegExp;
  taskType: TaskType;
  category: TaskCategory;
}

const PATTERNS: Pattern[] = [
  {
    re: /复习|review|revise|lecture|slides|PPT|课件/i,
    taskType: "review",
    category: "study",
  },
  {
    re: /背单词|单词|vocab|vocabulary|memorize words/i,
    taskType: "vocab",
    category: "study",
  },
  {
    re: /做题|题|problem|exercise|quiz/i,
    taskType: "problem",
    category: "study",
  },
  {
    re: /写代码|代码|code|coding|project|bug/i,
    taskType: "coding",
    category: "project",
  },
  {
    re: /作业|assignment|homework|A1|A2|lab/i,
    taskType: "assignment",
    category: "study",
  },
  {
    re: /邮件|email|reply/i,
    taskType: "email",
    category: "life",
  },
  {
    re: /整理|clean|organize/i,
    taskType: "organize",
    category: "life",
  },
];

/**
 * Detect the task type and extract the content target from a free-text input.
 * The detected keyword is stripped from the string; whatever remains becomes
 * the `target` (e.g. "复习 CSC311 lecture 2" → target "CSC311 lecture 2").
 */
export function parseTaskInput(input: string): ParsedTask {
  const t = input.trim();

  for (const { re, taskType, category } of PATTERNS) {
    if (re.test(t)) {
      const target = t.replace(re, "").replace(/\s+/g, " ").trim();
      return { taskType, target: target || t, category };
    }
  }

  return { taskType: "generic", target: t, category: "study" };
}

// ── Template builder ─────────────────────────────────────────────────────────

function task(
  title: string,
  estimatedMinutes: number,
  category: TaskCategory
): GeneratedTask {
  return { title, estimatedMinutes, difficulty: "easy", category };
}

/** Replace every {target} placeholder with the actual target string. */
function fill(template: string, target: string): string {
  return template.replace(/\{target\}/g, target);
}

/**
 * Generate a starter task and subtasks from a ParsedTask.
 * All output tasks have difficulty "easy" to lower activation energy.
 */
export function splitByTemplate(parsedTask: ParsedTask): SplitTaskOutput {
  const { taskType, target, category } = parsedTask;
  const tgt = target || "任务";

  let starterTask: GeneratedTask;
  let subtasks: GeneratedTask[];

  switch (taskType) {
    case "review":
      starterTask = task(
        fill("拿好 iPad、电脑、笔记，并打开 {target} 的教材/PPT", tgt),
        3,
        category
      );
      subtasks = [
        task(fill("快速浏览 {target} 的标题和小节", tgt), 5, category),
        task(fill("复习 {target} 的前 5 页并标出不懂的地方", tgt), 10, category),
        task(fill("写下 3 个 {target} 的核心概念", tgt), 8, category),
        task(fill("不看资料回忆一遍 {target} 的主要内容", tgt), 5, category),
      ];
      break;

    case "vocab":
      starterTask = task("打开单词表，准备好遮挡中文释义的工具", 2, category);
      subtasks = [
        task("背前 5 个单词", 5, category),
        task("遮住中文释义自测前 5 个单词", 5, category),
        task("背接下来的 5 个单词", 5, category),
        task("快速复习刚才错的单词", 5, category),
      ];
      break;

    case "problem":
      starterTask = task("打开题目页面，准备草稿纸或笔记软件", 2, category);
      subtasks = [
        task("读题并圈出关键词", 5, category),
        task("写下题目给出的已知条件", 5, category),
        task("只尝试写出第一步", 8, category),
        task("检查第一步是否和题目要求一致", 5, category),
      ];
      break;

    case "coding":
      starterTask = task("打开项目文件夹和要修改的代码文件", 3, category);
      subtasks = [
        task("找到一个最小可以修改的位置", 5, category),
        task("写下这次要改的一个小目标", 5, category),
        task("修改一个小函数或一小段代码", 10, category),
        task("运行一次程序或测试", 5, category),
      ];
      break;

    case "assignment":
      starterTask = task(
        fill("打开 {target} 文件，找到要求和第一道题", tgt),
        3,
        category
      );
      subtasks = [
        task(fill("快速读一遍 {target} 的要求", tgt), 5, category),
        task("列出需要完成的小部分", 5, category),
        task("先完成最简单的一小问", 10, category),
        task("保存文件并记录下一步", 3, category),
      ];
      break;

    case "email":
      starterTask = task("打开邮箱并找到要处理的邮件", 2, category);
      subtasks = [
        task("读一遍邮件并标出对方要你做什么", 5, category),
        task("写一个很粗糙的回复草稿", 8, category),
        task("检查称呼、关键信息和语气", 5, category),
        task("发送或保存草稿", 2, category),
      ];
      break;

    default:
      // organize + generic
      starterTask = task("准备好需要用到的材料，并设置 15 分钟计时器", 2, category);
      subtasks = [
        task("把任务要求读一遍", 5, category),
        task("做 5 分钟，不要求完成", 5, category),
        task("继续做 10 分钟", 10, category),
        task("快速检查当前进度", 5, category),
      ];
  }

  return { taskType, target: tgt, starterTask, subtasks };
}
