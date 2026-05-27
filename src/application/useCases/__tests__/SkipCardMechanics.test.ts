import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompleteTaskUseCase } from "../CompleteTaskUseCase";
import { SkipTaskUseCase } from "../SkipTaskUseCase";
import {
  InMemoryTaskRepository,
  InMemoryRoundStateRepository,
  InMemoryStatsRepository,
  makeTask,
  makeRoundState,
  makeStats,
} from "./testHelpers";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCompleteUC(
  roundStateRepo: InMemoryRoundStateRepository,
  taskRepo = new InMemoryTaskRepository([makeTask({ id: "t1" })]),
  statsRepo = new InMemoryStatsRepository(makeStats())
) {
  return new CompleteTaskUseCase(taskRepo, roundStateRepo, statsRepo);
}

function makeSkipUC(
  roundStateRepo: InMemoryRoundStateRepository,
  taskRepo = new InMemoryTaskRepository([makeTask({ id: "t1" })]),
  statsRepo = new InMemoryStatsRepository(makeStats())
) {
  return new SkipTaskUseCase(taskRepo, roundStateRepo, statsRepo);
}

// ── Skip card earning via CompleteTaskUseCase ─────────────────────────────────

describe("CompleteTaskUseCase – skip card progress", () => {
  it("adds 2 progress on the first completion of a new day (daily bonus)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T10:00:00"));

    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 0, skipCardProgress: 0, skipCardProgressDate: "" })
    );
    const uc = makeCompleteUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.skipCardProgress).toBe(2); // 1 regular + 1 daily bonus
    vi.useRealTimers();
  });

  it("adds only 1 progress on subsequent completions the same day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T10:00:00"));
    const TODAY = "2026-5-25";

    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 0, skipCardProgress: 1, skipCardProgressDate: TODAY })
    );
    const uc = makeCompleteUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.skipCardProgress).toBe(2); // 1 + 1
    vi.useRealTimers();
  });

  it("earns 1 skip card when progress reaches 3", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T10:00:00"));
    const TODAY = "2026-5-25";

    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 0, skipCardProgress: 2, skipCardProgressDate: TODAY })
    );
    const uc = makeCompleteUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.skipCardsLeft).toBe(1);
    expect(out.roundState.skipCardProgress).toBe(0); // 3 - 3 = 0
    vi.useRealTimers();
  });

  it("carries over surplus progress when earning a card", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00")); // new day → +2 gain

    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 0, skipCardProgress: 2, skipCardProgressDate: "2026-5-25" })
    );
    const uc = makeCompleteUC(repo);
    const out = await uc.execute("t1");

    // progress was 2, gain is 2 (daily bonus) → 4 >= 3 → earn card, progress = 4-3 = 1
    expect(out.roundState.skipCardsLeft).toBe(1);
    expect(out.roundState.skipCardProgress).toBe(1);
    vi.useRealTimers();
  });

  it("caps skip cards at 3 and stops accumulating progress when at max", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T10:00:00"));
    const TODAY = "2026-5-25";

    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 3, skipCardProgress: 2, skipCardProgressDate: TODAY })
    );
    const uc = makeCompleteUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.skipCardsLeft).toBe(3); // still capped
    expect(out.roundState.skipCardProgress).toBe(2); // unchanged (no accumulation at max)
    vi.useRealTimers();
  });

  it("clears consecutiveSkips on completion", async () => {
    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ consecutiveSkips: 1, skipCardsLeft: 2 })
    );
    const uc = makeCompleteUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.consecutiveSkips).toBe(0);
  });
});

// ── SkipTaskUseCase ───────────────────────────────────────────────────────────

describe("SkipTaskUseCase – basic skip", () => {
  it("decrements skipCardsLeft by 1", async () => {
    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 2, consecutiveSkips: 0 })
    );
    const uc = makeSkipUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.skipCardsLeft).toBe(1);
  });

  it("sets consecutiveSkips to 1 after a skip", async () => {
    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 2, consecutiveSkips: 0 })
    );
    const uc = makeSkipUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.consecutiveSkips).toBe(1);
  });

  it("clears activeTaskId so the next spin is unblocked", async () => {
    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 1, activeTaskId: "t1", consecutiveSkips: 0 })
    );
    const uc = makeSkipUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.activeTaskId).toBeNull();
  });

  it("adds the task ID to skippedTaskIdsThisRound", async () => {
    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 1, consecutiveSkips: 0 })
    );
    const uc = makeSkipUC(repo);
    const out = await uc.execute("t1");

    expect(out.roundState.skippedTaskIdsThisRound).toContain("t1");
  });
});

// ── Anti-abuse guards ─────────────────────────────────────────────────────────

describe("SkipTaskUseCase – guards", () => {
  it("throws when skipCardsLeft is 0", async () => {
    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 0, consecutiveSkips: 0 })
    );
    const uc = makeSkipUC(repo);
    await expect(uc.execute("t1")).rejects.toThrow("没有跳过卷");
  });

  it("throws when consecutiveSkips >= 1 even with cards available", async () => {
    const repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 3, consecutiveSkips: 1 })
    );
    const uc = makeSkipUC(repo);
    await expect(uc.execute("t1")).rejects.toThrow("需要先完成一个任务");
  });
});

// ── Full cycle: skip → complete → skip again ─────────────────────────────────

describe("SkipCardMechanics – full cycle", () => {
  let taskRepo: InMemoryTaskRepository;
  let repo: InMemoryRoundStateRepository;
  let statsRepo: InMemoryStatsRepository;

  beforeEach(() => {
    taskRepo = new InMemoryTaskRepository([
      makeTask({ id: "t1" }),
      makeTask({ id: "t2" }),
    ]);
    repo = new InMemoryRoundStateRepository(
      makeRoundState({ skipCardsLeft: 2, consecutiveSkips: 0 })
    );
    statsRepo = new InMemoryStatsRepository(makeStats());
  });

  it("allows skip → complete → skip sequence", async () => {
    const skipUC = new SkipTaskUseCase(taskRepo, repo, statsRepo);
    const completeUC = new CompleteTaskUseCase(taskRepo, repo, statsRepo);

    // First skip
    await skipUC.execute("t1");
    expect(repo.state.consecutiveSkips).toBe(1);

    // Second skip blocked
    await expect(skipUC.execute("t1")).rejects.toThrow("需要先完成一个任务");

    // Complete a task → resets consecutiveSkips
    await completeUC.execute("t2");
    expect(repo.state.consecutiveSkips).toBe(0);

    // Third skip now allowed again
    await expect(skipUC.execute("t1")).resolves.toBeDefined();
    expect(repo.state.consecutiveSkips).toBe(1);
  });

  it("cannot skip twice in a row without completing", async () => {
    const skipUC = new SkipTaskUseCase(taskRepo, repo, statsRepo);

    await skipUC.execute("t1");
    await expect(skipUC.execute("t2")).rejects.toThrow("需要先完成一个任务");
  });
});
