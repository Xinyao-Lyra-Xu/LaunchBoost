import { describe, it, expect } from "vitest";
import { winnerCenterDegrees, computeSpinTarget } from "../SpinnerPresenter";

type Seg = { id: string; type: "task" | "reward"; weight: number };

const seg = (id: string, type: "task" | "reward", weight: number): Seg => ({ id, type, weight });

describe("winnerCenterDegrees", () => {
  it("places a lone segment's centre opposite the top pointer (180°)", () => {
    expect(winnerCenterDegrees([seg("a", "task", 1)], { id: "a", type: "task" })).toBe(180);
  });

  it("splits two equal segments at 90° and 270°", () => {
    const items = [seg("a", "task", 1), seg("b", "task", 1)];
    expect(winnerCenterDegrees(items, { id: "a", type: "task" })).toBe(90);
    expect(winnerCenterDegrees(items, { id: "b", type: "task" })).toBe(270);
  });

  it("weights the arc by relative weight", () => {
    // a: 3/4 → arc 270°, centre 135°.  b: 1/4 → arc 90°, centre 315°.
    const items = [seg("a", "task", 3), seg("b", "task", 1)];
    expect(winnerCenterDegrees(items, { id: "a", type: "task" })).toBe(135);
    expect(winnerCenterDegrees(items, { id: "b", type: "task" })).toBe(315);
  });

  it("returns 0 when the winner is not on the wheel", () => {
    expect(winnerCenterDegrees([seg("a", "task", 1)], { id: "zzz", type: "task" })).toBe(0);
  });

  it("returns 0 for an empty / weightless wheel", () => {
    expect(winnerCenterDegrees([], { id: "a", type: "task" })).toBe(0);
    expect(winnerCenterDegrees([seg("a", "task", 0)], { id: "a", type: "task" })).toBe(0);
  });

  // Regression: task and reward id spaces overlap (legacy data numbers each
  // from 1). Matching id alone would resolve a task winner to a same-id reward
  // that appears earlier in the order and land the pointer on the wrong wedge.
  it("matches on type AND id when a task and reward share an id", () => {
    const items = [seg("1", "reward", 1), seg("1", "task", 9)]; // 10% / 90%
    // reward "1": arc 36°, centre 18°.  task "1": arc 324°, centre 198°.
    expect(winnerCenterDegrees(items, { id: "1", type: "task" })).toBe(198);
    expect(winnerCenterDegrees(items, { id: "1", type: "reward" })).toBe(18);
    // id-only matching would have wrongly returned 18 for the task winner.
    expect(winnerCenterDegrees(items, { id: "1", type: "task" })).not.toBe(18);
  });
});

describe("computeSpinTarget", () => {
  const items = [seg("a", "task", 1)]; // centre 180 → rest angle (360-180)=180

  it("lands the winner under the pointer (result mod 360 = rest angle)", () => {
    const target = computeSpinTarget(items, { id: "a", type: "task" }, 0, 1800);
    expect(((target % 360) + 360) % 360).toBe(180);
  });

  it("adds the whole-turn flourish on top of the current rotation", () => {
    const target = computeSpinTarget(items, { id: "a", type: "task" }, 0, 1800);
    expect(target).toBeGreaterThanOrEqual(1800);
  });

  it("lands on the same rest angle regardless of accumulated rotation", () => {
    const a = computeSpinTarget(items, { id: "a", type: "task" }, 0, 1800);
    const b = computeSpinTarget(items, { id: "a", type: "task" }, 123, 1800);
    const c = computeSpinTarget(items, { id: "a", type: "task" }, 7777, 2160);
    const norm = (x: number) => ((x % 360) + 360) % 360;
    expect(norm(a)).toBe(180);
    expect(norm(b)).toBe(180);
    expect(norm(c)).toBe(180);
  });

  it("never rewinds: the new rotation is always >= the current one", () => {
    const current = 5000;
    const target = computeSpinTarget(items, { id: "a", type: "task" }, current, 1800);
    expect(target).toBeGreaterThanOrEqual(current);
  });

  // Regression: a task winner colliding with a reward id must land on the task.
  it("lands a task winner on the task wedge, not a same-id reward", () => {
    const colliding = [seg("1", "reward", 1), seg("1", "task", 9)];
    const target = computeSpinTarget(colliding, { id: "1", type: "task" }, 0, 1800);
    const rest = ((target % 360) + 360) % 360;
    expect(rest).toBe((360 - 198) % 360); // task rest angle = 162
    expect(rest).not.toBe((360 - 18) % 360); // NOT the reward's 342
  });
});
