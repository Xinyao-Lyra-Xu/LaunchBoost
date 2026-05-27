import type { TaskRepository } from "../ports/TaskRepository";
import type { RoundStateRepository } from "../ports/RoundStateRepository";
import type { TaskSplitterGateway, SubtaskData } from "../ports/TaskSplitterGateway";
import type { Task } from "../../domain/entities/Task";

export interface SplitTaskOutput {
  subtasks: SubtaskData[];
}

export class SplitTaskUseCase {
  constructor(
    private taskRepo: TaskRepository,
    private splitterGateway: TaskSplitterGateway,
    private roundStateRepo: RoundStateRepository
  ) {}

  async execute(taskId: string): Promise<SplitTaskOutput> {
    const tasks = await this.taskRepo.getAll();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const result = await this.splitterGateway.splitTask({
      title: task.title,
      category: task.category,
      difficulty: task.difficulty,
      estimatedMinutes: task.estimatedMinutes,
    });

    if (!result.subtasks || result.subtasks.length === 0) {
      throw new Error("AI returned no subtasks.");
    }

    return { subtasks: result.subtasks };
  }

  /** Applies accepted subtasks: deactivates original, creates children, clears pending split. */
  async confirmSplit(
    originalTaskId: string,
    subtasks: SubtaskData[]
  ): Promise<Task[]> {
    if (!subtasks || subtasks.length === 0) {
      throw new Error("至少需要 1 个子任务才能确认拆解。");
    }
    const emptyTitles = subtasks.some((st) => !st.title.trim());
    if (emptyTitles) {
      throw new Error("子任务名称不能为空。");
    }

    const [tasks, roundState] = await Promise.all([
      this.taskRepo.getAll(),
      this.roundStateRepo.get(),
    ]);

    const original = tasks.find((t) => t.id === originalTaskId);
    if (!original) throw new Error(`Task ${originalTaskId} not found`);

    original.active = false;

    const newTasks: Task[] = subtasks.map((st) => ({
      id: crypto.randomUUID(),
      title: st.title,
      category: original.category,
      difficulty: "easy" as const,
      estimatedMinutes: st.estimatedMinutes,
      baseWeight: 2,
      repeatable: false,
      frequency: "once" as const,
      completedCount: 0,
      procrastinatedCount: 0,
      skippedCount: 0,
      active: true,
      parentTaskId: originalTaskId,
      timerMode: original.timerMode,
    }));

    // Clear the mandatory-split gate now that split is confirmed.
    // Also clear the active task lock — blocking responsibility shifts to hasBlockingSubtasks.
    roundState.pendingSplitTaskId = null;
    roundState.activeTaskId = null;

    await Promise.all([
      this.taskRepo.update(original),
      this.taskRepo.addMany(newTasks),
      this.roundStateRepo.save(roundState),
    ]);

    return newTasks;
  }
}
