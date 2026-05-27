// @vitest-environment jsdom
/**
 * RTL component tests: SplitTaskModal
 *
 * Covers scenarios (UI level):
 *  1  – modal shows task name; mandatory badge visible
 *  2  – confirm blocked when no subtasks filled in
 *  3  – user can add subtasks manually and confirm succeeds
 *  4  – empty subtask titles are rejected
 *  5  – user can edit and delete manual subtasks
 *  6  – AI path: gateway mock returns subtasks, user can edit and accept
 *  7  – AI failure: error shown, manual fallback available
 * 11  – backdrop and modal have no dismiss/close control (non-bypassable)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SplitTaskModal } from "../SplitTaskModal";
import type { Task } from "../../../../domain/entities/Task";
import type { SubtaskData } from "../../../../application/ports/TaskSplitterGateway";
import type { SplitModalState } from "../../hooks/useSpinnerApp";

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Write report",
    category: "study",
    difficulty: "hard",
    estimatedMinutes: 60,
    baseWeight: 3,
    repeatable: false,
    frequency: "once",
    completedCount: 0,
    procrastinatedCount: 1,
    skippedCount: 0,
    active: true,
    timerMode: "stopwatch",
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof SplitTaskModal>> = {}) {
  const defaults: React.ComponentProps<typeof SplitTaskModal> = {
    isOpen: true,
    task: makeTask(),
    splitState: "choice" as SplitModalState,
    aiSubtasks: null,
    errorMsg: "",
    onRequestAi: vi.fn(),
    onAcceptAi: vi.fn(),
    onRejectAi: vi.fn(),
    onConfirmManual: vi.fn(),
    onCancel: vi.fn(),
  };
  return render(<SplitTaskModal {...defaults} {...props} />);
}

// ── Scenario 1 – modal shows task name; mandatory badge ───────────────────────

describe("Scenario 1 – modal renders task name and mandatory badge", () => {
  it("displays the task title in the description", () => {
    renderModal();
    expect(screen.getByText("Write report")).toBeInTheDocument();
  });

  it("shows the mandatory badge", () => {
    renderModal();
    expect(screen.getByText(/必须拆解后才能继续转盘/)).toBeInTheDocument();
  });

  it("renders nothing when isOpen is false", () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText(/必须拆解后才能继续转盘/)).not.toBeInTheDocument();
  });

  it("renders nothing when task is null", () => {
    renderModal({ task: null });
    expect(screen.queryByText(/必须拆解后才能继续转盘/)).not.toBeInTheDocument();
  });
});

// ── Scenario 11 – non-dismissable ─────────────────────────────────────────────

describe("Scenario 11 – modal cannot be dismissed", () => {
  it("has no close / cancel / 不拆分 button", () => {
    renderModal();
    expect(screen.queryByRole("button", { name: /关闭|close|取消|不拆分/i })).not.toBeInTheDocument();
  });

  it("clicking the backdrop does NOT call onCancel", () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });
    const backdrop = document.getElementById("split-backdrop");
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

// ── Scenario 2 – confirm blocked with no valid subtasks ───────────────────────

describe("Scenario 2 – confirm blocked when no subtasks provided", () => {
  it("shows error and does not call onConfirmManual when all inputs are empty", async () => {
    const user = userEvent.setup();
    const onConfirmManual = vi.fn();
    renderModal({ splitState: "manual", onConfirmManual });
    await user.click(screen.getByRole("button", { name: /确认拆解/ }));
    expect(screen.getByText(/至少需要填写 1 个子任务/)).toBeInTheDocument();
    expect(onConfirmManual).not.toHaveBeenCalled();
  });
});

// ── Scenario 3 – manual add + confirm succeeds ───────────────────────────────

describe("Scenario 3 – user can add subtasks manually and confirm", () => {
  it("typing into an input and clicking confirm calls onConfirmManual", async () => {
    const user = userEvent.setup();
    const onConfirmManual = vi.fn();
    renderModal({ splitState: "manual", onConfirmManual });
    const inputs = screen.getAllByPlaceholderText(/子任务/);
    await user.click(inputs[0]);
    await user.type(inputs[0], "Step one");
    await user.click(screen.getByRole("button", { name: /确认拆解/ }));
    expect(onConfirmManual).toHaveBeenCalledWith(expect.arrayContaining(["Step one"]));
  });

  it("add button appends another input row", async () => {
    const user = userEvent.setup();
    renderModal({ splitState: "manual" });
    const before = screen.getAllByPlaceholderText(/子任务/).length;
    await user.click(screen.getByRole("button", { name: /添加子任务/ }));
    expect(screen.getAllByPlaceholderText(/子任务/)).toHaveLength(before + 1);
  });
});

// ── Scenario 4 – empty / whitespace titles rejected ──────────────────────────

describe("Scenario 4 – blank subtask titles are rejected", () => {
  it("whitespace-only input is treated as empty", async () => {
    const user = userEvent.setup();
    const onConfirmManual = vi.fn();
    renderModal({ splitState: "manual", onConfirmManual });
    const inputs = screen.getAllByPlaceholderText(/子任务/);
    await user.click(inputs[0]);
    // Type spaces — the confirm function trims and filters, so all-space = invalid
    await user.keyboard("   ");
    await user.click(screen.getByRole("button", { name: /确认拆解/ }));
    expect(onConfirmManual).not.toHaveBeenCalled();
    expect(screen.getByText(/至少需要填写 1 个子任务/)).toBeInTheDocument();
  });
});

// ── Scenario 5 – edit and delete manual subtasks ─────────────────────────────

describe("Scenario 5 – user can edit and delete manual subtask rows", () => {
  it("deletes a row when the delete button is clicked", async () => {
    const user = userEvent.setup();
    renderModal({ splitState: "manual" });
    const before = screen.getAllByPlaceholderText(/子任务/).length;
    await user.click(screen.getAllByTitle("删除")[0]);
    expect(screen.getAllByPlaceholderText(/子任务/)).toHaveLength(before - 1);
  });

  it("editing an input updates its value", async () => {
    const user = userEvent.setup();
    renderModal({ splitState: "manual" });
    const input = screen.getAllByPlaceholderText(/子任务/)[0];
    await user.click(input);
    await user.type(input, "Edited title");
    expect(input).toHaveValue("Edited title");
  });

  it("when only 1 row remains, no delete button is shown", async () => {
    const user = userEvent.setup();
    renderModal({ splitState: "manual" });
    // Delete until 1 remains
    while (screen.queryAllByTitle("删除").length > 0) {
      await user.click(screen.getAllByTitle("删除")[0]);
    }
    expect(screen.queryAllByTitle("删除")).toHaveLength(0);
    expect(screen.getAllByPlaceholderText(/子任务/)).toHaveLength(1);
  });
});

// ── Scenario 6 – AI results panel ────────────────────────────────────────────

describe("Scenario 6 – AI results panel", () => {
  const aiSubtasks: SubtaskData[] = [
    { title: "Research", estimatedMinutes: 20 },
    { title: "Write draft", estimatedMinutes: 30 },
  ];

  it("renders AI-suggested subtask titles as editable inputs", () => {
    renderModal({ splitState: "results", aiSubtasks });
    expect(screen.getByDisplayValue("Research")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Write draft")).toBeInTheDocument();
  });

  it("clicking confirm calls onAcceptAi with the subtask list", async () => {
    const user = userEvent.setup();
    const onAcceptAi = vi.fn();
    renderModal({ splitState: "results", aiSubtasks, onAcceptAi });
    await user.click(screen.getByRole("button", { name: /确认拆解/ }));
    expect(onAcceptAi).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: "Research" }),
        expect.objectContaining({ title: "Write draft" }),
      ])
    );
  });

  it("user can edit an AI-generated title before accepting", async () => {
    const user = userEvent.setup();
    const onAcceptAi = vi.fn();
    renderModal({ splitState: "results", aiSubtasks, onAcceptAi });
    const input = screen.getByDisplayValue("Research");
    await user.clear(input);
    await user.type(input, "Deep research");
    await user.click(screen.getByRole("button", { name: /确认拆解/ }));
    expect(onAcceptAi).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ title: "Deep research" })])
    );
  });

  it("deleting an AI subtask row removes it from the list", async () => {
    const user = userEvent.setup();
    renderModal({ splitState: "results", aiSubtasks });
    const titleInputsBefore = screen
      .getAllByRole("textbox")
      .filter((el) => el.classList.contains("ai-subtask-title")).length;
    await user.click(screen.getAllByTitle("删除")[0]);
    const titleInputsAfter = screen
      .getAllByRole("textbox")
      .filter((el) => el.classList.contains("ai-subtask-title")).length;
    expect(titleInputsAfter).toBe(titleInputsBefore - 1);
  });

  it("clicking the AI button in choice state calls onRequestAi", async () => {
    const user = userEvent.setup();
    const onRequestAi = vi.fn();
    renderModal({ splitState: "choice", onRequestAi });
    await user.click(screen.getByRole("button", { name: /AI 智能拆解/ }));
    expect(onRequestAi).toHaveBeenCalledTimes(1);
  });

  it("loading state shows spinner text", () => {
    renderModal({ splitState: "loading" });
    expect(screen.getByText(/AI 正在分析任务/)).toBeInTheDocument();
  });
});

// ── Scenario 7 – AI failure: error shown, manual fallback ────────────────────

describe("Scenario 7 – AI failure state", () => {
  it("shows the error message", () => {
    renderModal({ splitState: "error", errorMsg: "AI service unavailable" });
    expect(screen.getByText("AI service unavailable")).toBeInTheDocument();
  });

  it("manual fallback button calls onRejectAi", async () => {
    const user = userEvent.setup();
    const onRejectAi = vi.fn();
    renderModal({ splitState: "error", errorMsg: "网络错误", onRejectAi });
    await user.click(screen.getByRole("button", { name: /手动拆解/ }));
    expect(onRejectAi).toHaveBeenCalledTimes(1);
  });

  it("retry button calls onRequestAi", async () => {
    const user = userEvent.setup();
    const onRequestAi = vi.fn();
    renderModal({ splitState: "error", errorMsg: "timeout", onRequestAi });
    await user.click(screen.getByRole("button", { name: /重试/ }));
    expect(onRequestAi).toHaveBeenCalledTimes(1);
  });
});
