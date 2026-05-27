/**
 * Integration tests: procrastinate → mandatory split → spin flow
 *
 * Covers scenarios (use-case level):
 *  1  – after procrastinate, pendingSplitTaskId is set and spin is immediately blocked
 *  8  – subtasks not fully completed → spin remains blocked
 *  9  – all subtasks completed → spin is unblocked
 * 10  – pendingSplitTaskId and parentTaskId survive a "reload" (repo re-query)
 * 11  – confirmSplit cannot be bypassed by calling spin before it; state is consistent
 * 12  – procrastinated task is NOT marked completed (active stays true)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ProcrastinateTaskUseCase } from "../ProcrastinateTaskUseCase";
import { SplitTaskUseCase } from "../SplitTaskUseCase";
import { SpinWheelUseCase } from "../SpinWheelUseCase";
import {
  InMemoryTaskRepository,
  InMemoryRoundStateRepository,
  InMemoryRewardRepository,
  InMemorySpinHistoryRepository,
  InMemoryStatsRepository,
  StubTaskSplitterGateway,
  makeTask,
  makeRoundState,
} from "./testHelpers";

// ── shared fixture ────────────────────────────────────────────────────────────

function makeFlow(extraTasks: ReturnType<typeof makeTask>[] = []) {
  const taskRepo = new InMemoryTaskRepository([
    makeTask({ id: "t1", title: "Hard task", difficulty: "hard" }),
    makeTask({ id: "t2", title: "Another task", difficulty: "easy" }),
    ...extraTasks,
  ]);
  const roundStateRepo = new InMemoryRoundStateRepository(makeRoundState());
  const statsRepo = new InMemoryStatsRepository();
  const rewardRepo = new InMemoryRewardRepository();
  const historyRepo = new InMemorySpinHistoryRepository();
  const gateway = new StubTaskSplitterGateway(["Sub A", "Sub B"]);

  const procrastinate = new ProcrastinateTaskUseCase(taskRepo, roundStateRepo, statsRepo);
  const split = new SplitTaskUseCase(taskRepo, gateway, roundStateRepo);
  const spin = new SpinWheelUseCase(taskRepo, rewardRepo, roundStateRepo, historyRepo);

  return { taskRepo, roundStateRepo, statsRepo, rewardRepo, historyRepo, procrastinate, split, spin };
}

// ── Scenario 1 – state after procrastinate ────────────────────────────────────

describe("Scenario 1 – procrastinate sets pendingSplitTaskId and blocks spin", () => {
  it("pendingSplitTaskId is set to the procrastinated task id", async () => {
    const { procrastinate, roundStateRepo } = makeFlow();
    await procrastinate.execute("t1");
    const state = await roundStateRepo.get();
    expect(state.pendingSplitTaskId).toBe("t1");
  });

  it("spin throws immediately after procrastinate", async () => {
    const { procrastinate, spin } = makeFlow();
    await procrastinate.execute("t1");
    await expect(spin.execute()).rejects.toThrow("拆解");
  });

  it("the procrastinated task title is accessible via the task repo", async () => {
    const { procrastinate, taskRepo } = makeFlow();
    await procrastinate.execute("t1");
    const tasks = await taskRepo.getAll();
    const t = tasks.find((t) => t.id === "t1")!;
    expect(t.title).toBe("Hard task");
  });
});

// ── Scenario 12 – procrastinated task stays active (not completed) ─────────────

describe("Scenario 12 – procrastinated task is NOT marked completed", () => {
  it("task.active remains true after procrastinate", async () => {
    const { procrastinate, taskRepo } = makeFlow();
    await procrastinate.execute("t1");
    const t = (await taskRepo.getAll()).find((t) => t.id === "t1")!;
    expect(t.active).toBe(true);
  });

  it("task does not appear in completedTaskIdsThisRound", async () => {
    const { procrastinate, roundStateRepo } = makeFlow();
    await procrastinate.execute("t1");
    const state = await roundStateRepo.get();
    expect(state.completedTaskIdsThisRound).not.toContain("t1");
  });
});

// ── Scenario 8 – incomplete subtasks block spin ───────────────────────────────

describe("Scenario 8 – spin blocked while subtasks are incomplete", () => {
  it("spin is blocked after confirmSplit until subtasks are done", async () => {
    const { procrastinate, split, spin } = makeFlow();
    await procrastinate.execute("t1");
    // confirmSplit clears pendingSplitTaskId but creates active subtasks
    await split.confirmSplit("t1", [
      { title: "Sub A", estimatedMinutes: 10 },
      { title: "Sub B", estimatedMinutes: 10 },
    ]);
    // pendingSplitTaskId cleared, but active subtasks exist
    await expect(spin.execute()).rejects.toThrow("子任务");
  });

  it("partially completing subtasks still blocks spin", async () => {
    const { procrastinate, split, spin, taskRepo } = makeFlow();
    await procrastinate.execute("t1");
    await split.confirmSplit("t1", [
      { title: "Sub A", estimatedMinutes: 10 },
      { title: "Sub B", estimatedMinutes: 10 },
    ]);
    // complete only one subtask
    const allTasks = await taskRepo.getAll();
    const subA = allTasks.find((t) => t.title === "Sub A")!;
    subA.active = false;
    await taskRepo.update(subA);

    await expect(spin.execute()).rejects.toThrow("子任务");
  });
});

// ── Scenario 9 – all subtasks done → spin unblocked ──────────────────────────

describe("Scenario 9 – spin unblocked after all subtasks completed", () => {
  it("resolves after all subtasks marked inactive", async () => {
    const { procrastinate, split, spin, taskRepo } = makeFlow();
    await procrastinate.execute("t1");
    await split.confirmSplit("t1", [
      { title: "Sub A", estimatedMinutes: 10 },
      { title: "Sub B", estimatedMinutes: 10 },
    ]);
    const allTasks = await taskRepo.getAll();
    const subtasks = allTasks.filter((t) => t.parentTaskId === "t1");
    for (const sub of subtasks) {
      sub.active = false;
      await taskRepo.update(sub);
    }
    await expect(spin.execute()).resolves.toBeDefined();
  });

  it("spin result is recorded in history after unblocking", async () => {
    const { procrastinate, split, spin, taskRepo, historyRepo } = makeFlow();
    await procrastinate.execute("t1");
    await split.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 10 }]);
    const allTasks = await taskRepo.getAll();
    for (const sub of allTasks.filter((t) => t.parentTaskId === "t1")) {
      sub.active = false;
      await taskRepo.update(sub);
    }
    await spin.execute();
    const history = await historyRepo.getAll();
    expect(history).toHaveLength(1);
  });
});

// ── Scenario 10 – persistence across "reload" ─────────────────────────────────

describe("Scenario 10 – state persists across simulated reload", () => {
  it("pendingSplitTaskId survives a re-query of the repo", async () => {
    const { procrastinate, roundStateRepo } = makeFlow();
    await procrastinate.execute("t1");
    // Simulate reload: call get() again (InMemory persists in memory)
    const reloaded = await roundStateRepo.get();
    expect(reloaded.pendingSplitTaskId).toBe("t1");
  });

  it("parentTaskId on subtasks survives a re-query after confirmSplit", async () => {
    const { procrastinate, split, taskRepo } = makeFlow();
    await procrastinate.execute("t1");
    await split.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 10 }]);
    // Simulate reload
    const reloaded = await taskRepo.getAll();
    const sub = reloaded.find((t) => t.parentTaskId === "t1");
    expect(sub).toBeDefined();
    expect(sub!.parentTaskId).toBe("t1");
  });

  it("pendingSplitTaskId is null after confirmSplit + reload", async () => {
    const { procrastinate, split, roundStateRepo } = makeFlow();
    await procrastinate.execute("t1");
    await split.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 10 }]);
    const reloaded = await roundStateRepo.get();
    expect(reloaded.pendingSplitTaskId).toBeNull();
  });

  it("spin still blocked after reload when subtasks still active", async () => {
    const { procrastinate, split, taskRepo, roundStateRepo, spin } = makeFlow();
    await procrastinate.execute("t1");
    await split.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 10 }]);
    // Create a fresh SpinWheelUseCase using the same repos (simulating reload)
    const reloadedSpin = new SpinWheelUseCase(
      taskRepo,
      new InMemoryRewardRepository(),
      roundStateRepo,
      new InMemorySpinHistoryRepository()
    );
    await expect(reloadedSpin.execute()).rejects.toThrow("子任务");
  });
});

// ── Scenario 11 – bypass attempts at use-case level ──────────────────────────

describe("Scenario 11 – spin cannot bypass mandatory split", () => {
  it("calling spin before confirmSplit always throws", async () => {
    const { procrastinate, spin } = makeFlow();
    await procrastinate.execute("t1");
    // Try multiple times — should never succeed
    await expect(spin.execute()).rejects.toThrow();
    await expect(spin.execute()).rejects.toThrow();
  });

  it("confirms split with valid subtasks — state is then consistent", async () => {
    const { procrastinate, split, roundStateRepo } = makeFlow();
    await procrastinate.execute("t1");
    await split.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 10 }]);
    const state = await roundStateRepo.get();
    expect(state.pendingSplitTaskId).toBeNull();
  });

  it("original task deactivated after confirmSplit (no longer spinnable as a top-level task)", async () => {
    const { procrastinate, split, taskRepo } = makeFlow();
    await procrastinate.execute("t1");
    await split.confirmSplit("t1", [{ title: "Sub A", estimatedMinutes: 10 }]);
    const t1 = (await taskRepo.getAll()).find((t) => t.id === "t1")!;
    expect(t1.active).toBe(false);
  });
});
