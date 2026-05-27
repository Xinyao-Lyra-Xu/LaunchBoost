import { describe, it, expect } from "vitest";
import { SplitTaskUseCase } from "../SplitTaskUseCase";
import {
  InMemoryTaskRepository,
  InMemoryRoundStateRepository,
  StubTaskSplitterGateway,
  FailingTaskSplitterGateway,
  makeTask,
  makeRoundState,
} from "./testHelpers";

function makeDeps(overrides: {
  tasks?: ReturnType<typeof makeTask>[];
  roundState?: Partial<Parameters<typeof makeRoundState>[0]>;
  splitterTitles?: string[];
} = {}) {
  const taskRepo = new InMemoryTaskRepository(
    overrides.tasks ?? [makeTask({ id: "t1", title: "原始任务", difficulty: "hard" })]
  );
  const roundStateRepo = new InMemoryRoundStateRepository(
    makeRoundState({ pendingSplitTaskId: "t1", ...overrides.roundState })
  );
  const gateway = new StubTaskSplitterGateway(
    overrides.splitterTitles ?? ["子任务 A", "子任务 B"]
  );
  const useCase = new SplitTaskUseCase(taskRepo, gateway, roundStateRepo);
  return { taskRepo, roundStateRepo, gateway, useCase };
}

// ── confirmSplit ──────────────────────────────────────────────────────────────

describe("SplitTaskUseCase.confirmSplit", () => {
  it("throws when subtasks array is empty", async () => {
    const { useCase } = makeDeps();
    await expect(useCase.confirmSplit("t1", [])).rejects.toThrow("至少需要 1 个子任务");
  });

  it("throws when any subtask title is empty", async () => {
    const { useCase } = makeDeps();
    await expect(
      useCase.confirmSplit("t1", [{ title: "", estimatedMinutes: 15 }])
    ).rejects.toThrow("子任务名称不能为空");
  });

  it("throws when any subtask title is whitespace only", async () => {
    const { useCase } = makeDeps();
    await expect(
      useCase.confirmSplit("t1", [{ title: "   ", estimatedMinutes: 15 }])
    ).rejects.toThrow("子任务名称不能为空");
  });

  it("deactivates the original task", async () => {
    const { useCase, taskRepo } = makeDeps();
    await useCase.confirmSplit("t1", [
      { title: "Sub A", estimatedMinutes: 10 },
      { title: "Sub B", estimatedMinutes: 20 },
    ]);
    const original = (await taskRepo.getAll()).find((t) => t.id === "t1")!;
    expect(original.active).toBe(false);
  });

  it("sets parentTaskId on every created subtask", async () => {
    const { useCase, taskRepo } = makeDeps();
    const created = await useCase.confirmSplit("t1", [
      { title: "Sub A", estimatedMinutes: 10 },
      { title: "Sub B", estimatedMinutes: 20 },
    ]);
    expect(created).toHaveLength(2);
    for (const st of created) {
      expect(st.parentTaskId).toBe("t1");
    }
    // Also verify they ended up in the repo
    const allTasks = await taskRepo.getAll();
    const subtasks = allTasks.filter((t) => t.parentTaskId === "t1");
    expect(subtasks).toHaveLength(2);
  });

  it("subtasks inherit the parent category and are always easy + once", async () => {
    const { useCase, taskRepo } = makeDeps({
      tasks: [makeTask({ id: "t1", category: "project", difficulty: "hard" })],
    });
    await useCase.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 15 }]);
    const subtask = (await taskRepo.getAll()).find((t) => t.parentTaskId === "t1")!;
    expect(subtask.category).toBe("project");
    expect(subtask.difficulty).toBe("easy");
    expect(subtask.frequency).toBe("once");
    expect(subtask.repeatable).toBe(false);
  });

  it("clears pendingSplitTaskId in RoundState after confirmation", async () => {
    const { useCase, roundStateRepo } = makeDeps();
    await useCase.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 15 }]);
    const saved = await roundStateRepo.get();
    expect(saved.pendingSplitTaskId).toBeNull();
  });

  it("throws when original task is not found", async () => {
    const { useCase } = makeDeps();
    await expect(
      useCase.confirmSplit("nonexistent", [{ title: "Sub A", estimatedMinutes: 15 }])
    ).rejects.toThrow("not found");
  });
});

// ── execute (AI split) ────────────────────────────────────────────────────────

describe("SplitTaskUseCase.execute (AI path)", () => {
  it("returns subtasks from the gateway", async () => {
    const { useCase } = makeDeps({ splitterTitles: ["Step 1", "Step 2", "Step 3"] });
    const result = await useCase.execute("t1");
    expect(result.subtasks).toHaveLength(3);
    expect(result.subtasks[0].title).toBe("Step 1");
  });

  it("throws when gateway returns no subtasks", async () => {
    const taskRepo = new InMemoryTaskRepository([makeTask({ id: "t1" })]);
    const roundStateRepo = new InMemoryRoundStateRepository(
      makeRoundState({ pendingSplitTaskId: "t1" })
    );
    const emptyGateway = new StubTaskSplitterGateway([]);
    // Override StubTaskSplitterGateway to return empty array
    (emptyGateway as unknown as { splitTask: () => Promise<{ subtasks: [] }> }).splitTask =
      async () => ({ subtasks: [] });
    const useCase = new SplitTaskUseCase(taskRepo, emptyGateway, roundStateRepo);
    await expect(useCase.execute("t1")).rejects.toThrow("no subtasks");
  });

  it("propagates gateway errors (AI unavailable)", async () => {
    const taskRepo = new InMemoryTaskRepository([makeTask({ id: "t1" })]);
    const roundStateRepo = new InMemoryRoundStateRepository(makeRoundState());
    const useCase = new SplitTaskUseCase(
      taskRepo,
      new FailingTaskSplitterGateway(),
      roundStateRepo
    );
    await expect(useCase.execute("t1")).rejects.toThrow("AI service unavailable");
  });
});

// ── Persistence round-trip ────────────────────────────────────────────────────

describe("pendingSplitTaskId persistence", () => {
  it("persists pendingSplitTaskId and restores it correctly", async () => {
    const roundStateRepo = new InMemoryRoundStateRepository(
      makeRoundState({ pendingSplitTaskId: "t99" })
    );
    const loaded = await roundStateRepo.get();
    expect(loaded.pendingSplitTaskId).toBe("t99");
  });

  it("clears pendingSplitTaskId after confirmSplit and persists the cleared value", async () => {
    const { useCase, roundStateRepo } = makeDeps({
      roundState: { pendingSplitTaskId: "t1" },
    });
    await useCase.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 10 }]);

    // Simulate reload — call get() again
    const reloaded = await roundStateRepo.get();
    expect(reloaded.pendingSplitTaskId).toBeNull();
  });
});
