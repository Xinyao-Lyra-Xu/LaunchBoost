import type { TaskRepository } from "../../application/ports/TaskRepository";
import type { RoundStateRepository } from "../../application/ports/RoundStateRepository";
import type { CompleteTaskUseCase } from "../../application/useCases/CompleteTaskUseCase";
import type { ProcrastinateTaskUseCase } from "../../application/useCases/ProcrastinateTaskUseCase";
import type { SkipTaskUseCase } from "../../application/useCases/SkipTaskUseCase";
import type { ResetRoundUseCase } from "../../application/useCases/ResetRoundUseCase";
import type { Task } from "../../domain/entities/Task";
import type { TaskCategory } from "../../domain/valueObjects/TaskCategory";
import type { TaskDifficulty } from "../../domain/valueObjects/TaskDifficulty";
import type { TaskFrequency } from "../../domain/entities/Task";

export interface TaskEditFields {
  title: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  estimatedMinutes: number;
  baseWeight: number;
  repeatable: boolean;
  frequency: TaskFrequency;
}

export class TaskController {
  constructor(
    private taskRepo: TaskRepository,
    private roundStateRepo: RoundStateRepository,
    private completeTaskUseCase: CompleteTaskUseCase,
    private procrastinateTaskUseCase: ProcrastinateTaskUseCase,
    private skipTaskUseCase: SkipTaskUseCase,
    private resetRoundUseCase: ResetRoundUseCase
  ) {}

  async completeTask(taskId: string) {
    return this.completeTaskUseCase.execute(taskId);
  }

  async procrastinateTask(taskId: string) {
    return this.procrastinateTaskUseCase.execute(taskId);
  }

  async skipTask(taskId: string) {
    return this.skipTaskUseCase.execute(taskId);
  }

  async resetRound() {
    return this.resetRoundUseCase.execute();
  }

  async saveTask(id: string | null, fields: TaskEditFields): Promise<Task> {
    const tasks = await this.taskRepo.getAll();

    if (id) {
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new Error(`Task ${id} not found`);
      Object.assign(task, fields);
      await this.taskRepo.update(task);
      return task;
    } else {
      const newTask: Task = {
        id: crypto.randomUUID(),
        ...fields,
        completedCount: 0,
        procrastinatedCount: 0,
        skippedCount: 0,
        active: true,
      };
      await this.taskRepo.addMany([newTask]);
      return newTask;
    }
  }

  async deleteTask(id: string): Promise<void> {
    const tasks = await this.taskRepo.getAll();
    const filtered = tasks.filter((t) => t.id !== id);
    await this.taskRepo.saveAll(filtered);
  }

  async bulkImport(
    items: Array<{ title: string; category: TaskCategory; difficulty: TaskDifficulty; estimatedMinutes: number }>
  ): Promise<Task[]> {
    const newTasks: Task[] = items.map((item) => ({
      id: crypto.randomUUID(),
      ...item,
      baseWeight: 2,
      repeatable: true,
      frequency: "custom" as TaskFrequency,
      completedCount: 0,
      procrastinatedCount: 0,
      skippedCount: 0,
      active: true,
    }));
    await this.taskRepo.addMany(newTasks);
    return newTasks;
  }

  async toggleTask(id: string): Promise<Task> {
    const tasks = await this.taskRepo.getAll();
    const roundState = await this.roundStateRepo.get();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);

    const isCompleted = roundState.completedTaskIdsThisRound.includes(id);
    if (isCompleted) {
      roundState.completedTaskIdsThisRound = roundState.completedTaskIdsThisRound.filter(
        (tid) => tid !== id
      );
      task.active = true;
    } else {
      task.completedCount += 1;
      roundState.completedTaskIdsThisRound.push(id);
      if (!task.repeatable) task.active = false;
    }

    await Promise.all([
      this.taskRepo.update(task),
      this.roundStateRepo.save(roundState),
    ]);
    return task;
  }
}
