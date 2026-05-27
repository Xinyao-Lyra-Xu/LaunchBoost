import { describe, it, expect } from "vitest";
import { SpinWheelUseCase } from "../SpinWheelUseCase";
import {
  InMemoryTaskRepository,
  InMemoryRoundStateRepository,
  InMemoryRewardRepository,
  InMemorySpinHistoryRepository,
  makeTask,
  makeRoundState,
} from "./testHelpers";

function makeDeps(overrides: {
  tasks?: ReturnType<typeof makeTask>[];
  roundState?: Partial<Parameters<typeof makeRoundState>[0]>;
  rewards?: never[];
} = {}) {
  const taskRepo = new InMemoryTaskRepository(
    overrides.tasks ?? [makeTask({ id: "t1" })]
  );
  const rewardRepo = new InMemoryRewardRepository(overrides.rewards ?? []);
  const roundStateRepo = new InMemoryRoundStateRepository(
    makeRoundState(overrides.roundState)
  );
  const historyRepo = new InMemorySpinHistoryRepository();
  const useCase = new SpinWheelUseCase(taskRepo, rewardRepo, roundStateRepo, historyRepo);
  return { taskRepo, rewardRepo, roundStateRepo, historyRepo, useCase };
}

describe("SpinWheelUseCase – activeTaskId blocking", () => {
  it("throws when activeTaskId is set (task not yet resolved)", async () => {
    const { useCase } = makeDeps({
      roundState: { activeTaskId: "t1" },
    });
    await expect(useCase.execute()).rejects.toThrow("请先完成当前任务后再转动");
  });

  it("does NOT throw when activeTaskId is null", async () => {
    const { useCase } = makeDeps({
      roundState: { activeTaskId: null },
    });
    await expect(useCase.execute()).resolves.toBeDefined();
  });

  it("activeTaskId check fires before pendingSplitTaskId check", async () => {
    const { useCase } = makeDeps({
      roundState: { activeTaskId: "t1", pendingSplitTaskId: "t1" },
    });
    await expect(useCase.execute()).rejects.toThrow("请先完成当前任务后再转动");
  });
});

describe("SpinWheelUseCase – blocking guards", () => {
  it("throws when pendingSplitTaskId is set", async () => {
    const { useCase } = makeDeps({
      roundState: { pendingSplitTaskId: "t1" },
    });
    await expect(useCase.execute()).rejects.toThrow("请先完成任务拆解");
  });

  it("throws when active subtasks exist (parentTaskId set)", async () => {
    const { useCase } = makeDeps({
      tasks: [
        makeTask({ id: "parent-1", active: false }),
        makeTask({ id: "sub-1", active: true, parentTaskId: "parent-1" }),
      ],
    });
    await expect(useCase.execute()).rejects.toThrow("请先完成所有子任务");
  });

  it("does NOT throw when subtask is inactive (completed)", async () => {
    const { useCase } = makeDeps({
      tasks: [
        makeTask({ id: "parent-1", active: false }),
        // sub-1 is inactive → completed, no longer blocking
        makeTask({ id: "sub-1", active: false, parentTaskId: "parent-1" }),
        makeTask({ id: "t2", active: true }),
      ],
    });
    await expect(useCase.execute()).resolves.toBeDefined();
  });

  it("does NOT throw when pendingSplitTaskId is null and no active subtasks", async () => {
    const { useCase } = makeDeps();
    await expect(useCase.execute()).resolves.toBeDefined();
  });

  it("throws 'No active items' when wheel is empty (no tasks, no rewards)", async () => {
    const { useCase } = makeDeps({ tasks: [] });
    await expect(useCase.execute()).rejects.toThrow("No active items");
  });

  it("records a spin result in history after successful spin", async () => {
    const { useCase, historyRepo } = makeDeps();
    await useCase.execute();
    const history = await historyRepo.getAll();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("pending");
  });
});

describe("SpinWheelUseCase – subtask completion unblocks spin", () => {
  it("allows spin after last active subtask is completed", async () => {
    const taskRepo = new InMemoryTaskRepository([
      makeTask({ id: "parent-1", active: false }),
      makeTask({ id: "sub-1", active: true, parentTaskId: "parent-1" }),
      makeTask({ id: "sub-2", active: true, parentTaskId: "parent-1" }),
    ]);
    const roundStateRepo = new InMemoryRoundStateRepository(makeRoundState());
    const rewardRepo = new InMemoryRewardRepository([]);
    const historyRepo = new InMemorySpinHistoryRepository();
    const useCase = new SpinWheelUseCase(taskRepo, rewardRepo, roundStateRepo, historyRepo);

    // Still blocked
    await expect(useCase.execute()).rejects.toThrow("子任务");

    // Complete both subtasks
    const sub1 = taskRepo.tasks.find((t) => t.id === "sub-1")!;
    sub1.active = false;
    await taskRepo.update(sub1);
    const sub2 = taskRepo.tasks.find((t) => t.id === "sub-2")!;
    sub2.active = false;
    await taskRepo.update(sub2);

    // Add another active task so the wheel is not empty
    await taskRepo.addMany([makeTask({ id: "new-1", active: true })]);

    // Now unblocked
    await expect(useCase.execute()).resolves.toBeDefined();
  });
});
