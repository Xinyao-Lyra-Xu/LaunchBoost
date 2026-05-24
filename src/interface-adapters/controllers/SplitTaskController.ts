import type { SplitTaskUseCase } from "../../application/useCases/SplitTaskUseCase";
import type { SubtaskData } from "../../application/ports/TaskSplitterGateway";
import type { Task } from "../../domain/entities/Task";

export class SplitTaskController {
  constructor(private splitTaskUseCase: SplitTaskUseCase) {}

  async requestAiSplit(taskId: string): Promise<SubtaskData[]> {
    const result = await this.splitTaskUseCase.execute(taskId);
    return result.subtasks;
  }

  async confirmSplit(
    originalTaskId: string,
    subtasks: SubtaskData[]
  ): Promise<Task[]> {
    return this.splitTaskUseCase.confirmSplit(originalTaskId, subtasks);
  }
}
