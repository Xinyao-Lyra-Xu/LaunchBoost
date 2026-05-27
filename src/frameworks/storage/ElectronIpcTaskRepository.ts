import type { TaskRepository } from "../../application/ports/TaskRepository";
import type { Task, TaskFrequency, TimerMode } from "../../domain/entities/Task";
import type { TaskCategory } from "../../domain/valueObjects/TaskCategory";
import type { TaskDifficulty } from "../../domain/valueObjects/TaskDifficulty";
import type { PersistedTask } from "../../electron";
import { dataStore } from "./ElectronIpcDataStore";
import { isTaskCategory } from "../../domain/valueObjects/TaskCategory";
import { isTaskDifficulty } from "../../domain/valueObjects/TaskDifficulty";

function toTask(p: PersistedTask, roundCompletedIds: string[]): Task {
  const id = String(p.id);
  const isCompleted = p.completed || roundCompletedIds.includes(id);
  return {
    id,
    title: p.title || "未命名任务",
    category: isTaskCategory(p.category) ? (p.category as TaskCategory) : "study",
    difficulty: isTaskDifficulty(p.difficulty) ? (p.difficulty as TaskDifficulty) : "easy",
    estimatedMinutes: p.estimatedMinutes || 15,
    baseWeight: p.weight || 2,
    repeatable: p.repeatable !== undefined ? p.repeatable : true,
    frequency: (["daily", "weekly", "custom", "once"].includes(p.frequency)
      ? p.frequency
      : "custom") as TaskFrequency,
    completedCount: p.completedCount || 0,
    procrastinatedCount: p.procrastinatedCount || 0,
    skippedCount: p.skippedCount || 0,
    active: p.activeInCurrentRound !== false && !isCompleted,
    parentTaskId: p.parentTaskId,
    timerMode: (p.timerMode === "countdown" ? "countdown" : "stopwatch") as TimerMode,
  };
}

function toPersistedTask(t: Task): PersistedTask {
  return {
    id: parseInt(t.id, 10) || 0,
    title: t.title,
    category: t.category,
    difficulty: t.difficulty,
    estimatedMinutes: t.estimatedMinutes,
    weight: t.baseWeight,
    repeatable: t.repeatable,
    frequency: t.frequency,
    completed: false,
    completedCount: t.completedCount,
    procrastinatedCount: t.procrastinatedCount,
    skippedCount: t.skippedCount,
    activeInCurrentRound: t.active,
    parentTaskId: t.parentTaskId,
    timerMode: t.timerMode,
  };
}

export class ElectronIpcTaskRepository implements TaskRepository {
  async getAll(): Promise<Task[]> {
    const data = await dataStore.get();
    const completedIds = (data.meta?.skipCards ? [] : []) as string[];
    return data.tasks.map((p) => toTask(p, completedIds));
  }

  async saveAll(tasks: Task[]): Promise<void> {
    const data = await dataStore.get();
    const prevMap = new Map(data.tasks.map((p) => [String(p.id), p]));
    data.tasks = tasks.map((t) => {
      const prev = prevMap.get(t.id);
      const p = toPersistedTask(t);
      return prev
        ? { ...p, completed: prev.completed, activeInCurrentRound: t.active }
        : p;
    });
    await dataStore.save(data);
  }

  async update(task: Task): Promise<void> {
    const data = await dataStore.get();
    const idx = data.tasks.findIndex((p) => String(p.id) === task.id);
    if (idx !== -1) {
      // Preserve completed/activeInCurrentRound — those are owned by RoundStateRepository
      const prev = data.tasks[idx];
      data.tasks[idx] = {
        ...toPersistedTask(task),
        completed: prev.completed,
        activeInCurrentRound: prev.activeInCurrentRound,
      };
    } else {
      data.tasks.push(toPersistedTask(task));
    }
    await dataStore.save(data);
  }

  async addMany(tasks: Task[]): Promise<void> {
    const data = await dataStore.get();
    // Compute next numeric ID for backward compat
    const maxId = data.tasks.reduce((m, p) => Math.max(m, p.id || 0), 0);
    let nextId = maxId + 1;
    const toAdd = tasks.map((t) => {
      const p = toPersistedTask(t);
      if (!p.id) p.id = nextId++;
      return p;
    });
    data.tasks.push(...toAdd);
    await dataStore.save(data);
  }
}
