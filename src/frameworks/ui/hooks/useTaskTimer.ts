import { useState, useEffect, useRef } from "react";
import type { TimerMode } from "../../../domain/entities/Task";

export interface TaskTimerResult {
  displayTime: string;
  elapsed: number;
  paused: boolean;
  isOvertime: boolean;
  isCountdownDone: boolean;
  toggle(): void;
}

/**
 * Self-contained task timer.
 *
 * - stopwatch: counts up from 00:00
 * - countdown: counts down from countdownSeconds; goes negative (overtime) after 0
 *
 * Resets automatically when resetKey changes (new task spun).
 */
export function useTaskTimer(
  active: boolean,
  timerMode: TimerMode,
  countdownSeconds: number,
  resetKey: string
): TaskTimerResult {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when the active task changes.
  useEffect(() => {
    setElapsed(0);
    setPaused(false);
  }, [resetKey]);

  // Tick every second while active and not paused.
  useEffect(() => {
    if (!active || paused) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, paused]);

  const remaining = countdownSeconds - elapsed;
  const isOvertime = timerMode === "countdown" && remaining < 0;
  const isCountdownDone = timerMode === "countdown" && remaining <= 0;

  const absSeconds = timerMode === "countdown" ? Math.abs(remaining) : elapsed;
  const mm = String(Math.floor(absSeconds / 60)).padStart(2, "0");
  const ss = String(absSeconds % 60).padStart(2, "0");
  const displayTime = `${isOvertime ? "-" : ""}${mm}:${ss}`;

  return {
    displayTime,
    elapsed,
    paused,
    isOvertime,
    isCountdownDone,
    toggle: () => setPaused((p) => !p),
  };
}
