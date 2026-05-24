import type { Task } from "../../domain/entities/Task";

export interface TaskRepository {
  getAll(): Promise<Task[]>;
  saveAll(tasks: Task[]): Promise<void>;
  update(task: Task): Promise<void>;
  addMany(tasks: Task[]): Promise<void>;
}
