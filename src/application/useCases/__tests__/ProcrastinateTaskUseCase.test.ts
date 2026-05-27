import { describe, it, expect } from "vitest";
import { ProcrastinateTaskUseCase } from "../ProcrastinateTaskUseCase";
import {
  InMemoryTaskRepository,
  InMemoryRoundStateRepository,
  InMemoryStatsRepository,
  makeTask,
  makeRoundState,
} from "./testHelpers";

function makeDeps(overrides: {
  tasks?: ReturnType<typeof makeTask>[];
  roundState?: Partial<Parameters<typeof makeRoundState>[0]>;
} = {}) {
  const taskRepo = new InMemoryTaskRepository(
    overrides.tasks ?? [makeTask({ id: "t1", difficulty: "easy" })]
  );
  const roundStateRepo = new InMemoryRoundStateRepository(
    makeRoundState(overrides.roundState)
  );
  const statsRepo = new InMemoryStatsRepository();
  const useCase = new ProcrastinateTaskUseCase(taskRepo, roundStateRepo, statsRepo);
  return { taskRepo, roundStateRepo, statsRepo, useCase };
}

describe("ProcrastinateTaskUseCase", () => {
  it("sets pendingSplitTaskId for an easy task (all difficulties now require split)", async () => {
    const { useCase, roundStateRepo } = makeDeps({
      tasks: [makeTask({ id: "t1", difficulty: "easy" })],
    });
    const out = await useCase.execute("t1");

    expect(out.roundState.pendingSplitTaskId).toBe("t1");
    const saved = await roundStateRepo.get();
    expect(saved.pendingSplitTaskId).toBe("t1");
  });

  it("sets pendingSplitTaskId for a medium task", async () => {
    const { useCase } = makeDeps({
      tasks: [makeTask({ id: "t2", difficulty: "medium" })],
    });
    const out = await useCase.execute("t2");
    expect(out.roundState.pendingSplitTaskId).toBe("t2");
  });

  it("sets pendingSplitTaskId for a hard task", async () => {
    const { useCase } = makeDeps({
      tasks: [makeTask({ id: "t3", difficulty: "hard" })],
    });
    const out = await useCase.execute("t3");
    expect(out.roundState.pendingSplitTaskId).toBe("t3");
  });

  it("activates procrastinationRecoveryMode", async () => {
    const { useCase } = makeDeps();
    const out = await useCase.execute("t1");
    expect(out.roundState.procrastinationRecoveryMode).toBe(true);
  });

  it("increments procrastinatedCount on the task", async () => {
    const { useCase, taskRepo } = makeDeps({
      tasks: [makeTask({ id: "t1", procrastinatedCount: 2 })],
    });
    await useCase.execute("t1");
    const saved = (await taskRepo.getAll()).find((t) => t.id === "t1")!;
    expect(saved.procrastinatedCount).toBe(3);
  });

  it("bumps procrastination stats", async () => {
    const { useCase, statsRepo } = makeDeps();
    const out = await useCase.execute("t1");
    expect(out.stats.procrastinatedToday).toBe(1);
    expect(out.stats.totalProcrastinated).toBe(1);
    const saved = await statsRepo.get();
    expect(saved.procrastinatedToday).toBe(1);
  });

  it("throws if task id not found", async () => {
    const { useCase } = makeDeps();
    await expect(useCase.execute("nonexistent")).rejects.toThrow("not found");
  });
});
