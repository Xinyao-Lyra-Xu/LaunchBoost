import type {
  TaskSplitterGateway,
  SplitTaskInput,
  SplitTaskOutput,
} from "../../application/ports/TaskSplitterGateway";

/** Calls the AI splitting logic in the Electron main process via IPC. */
export class ElectronIpcTaskSplitterGateway implements TaskSplitterGateway {
  async splitTask(input: SplitTaskInput): Promise<SplitTaskOutput> {
    const result = await window.api.splitTask(input);
    if (result.error) throw new Error(result.error);
    if (!result.subtasks || result.subtasks.length === 0) {
      throw new Error("AI 返回了空的子任务列表");
    }
    return { subtasks: result.subtasks };
  }
}
