import { useRef, useEffect, useCallback } from "react";
import type { WheelDisplayItem } from "../../../interface-adapters/viewModels/SpinnerViewModel";

const DPR = window.devicePixelRatio || 1;

// Type-based palette (spec): tasks = purple, rewards = amber, dark text.
// Adjacent same-type segments alternate base/shade so they stay distinct.
const PALETTE = {
  task: { fill: "#EEEDFE", fillAlt: "#DDDAF7", text: "#26215C" },
  reward: { fill: "#FAEEDA", fillAlt: "#F2DEBC", text: "#412402" },
} as const;

const EASE_OUT_QUART = (t: number) => 1 - Math.pow(1 - t, 4);
const TWO_PI = Math.PI * 2;
const deg2rad = (d: number) => (d * Math.PI) / 180;

/**
 * Truncates text to fit within maxWidth using a binary-search approach.
 * Returns empty string if even a single character + ellipsis doesn't fit.
 */
function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  const ellipsisW = ctx.measureText(ellipsis).width;
  if (ellipsisW >= maxWidth) return "";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid)).width + ellipsisW <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo > 0 ? text.slice(0, lo) + ellipsis : "";
}

/**
 * Draws one segment's radial label. Assumes the context is already
 * translated to the wheel centre and rotated by the current spin angle —
 * so text is drawn relative to origin (0,0), never skewed.
 */
function drawSegmentText(
  ctx: CanvasRenderingContext2D,
  text: string,
  midAngle: number,
  isReward: boolean,
  arcAngle: number,
  radius: number,
) {
  // Skip segments too narrow to render any readable text.
  if (arcAngle < Math.PI / 18) return;

  ctx.save();
  ctx.rotate(midAngle);

  const norm = ((midAngle % TWO_PI) + TWO_PI) % TWO_PI;
  const flip = norm > Math.PI / 2 && norm < (Math.PI * 3) / 2;

  ctx.fillStyle = isReward ? PALETTE.reward.text : PALETTE.task.text;

  const fontSize =
    arcAngle < Math.PI / 9 ? 9 : arcAngle < Math.PI / 6 ? 11 : arcAngle < Math.PI / 4 ? 12 : 13;
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;
  ctx.textBaseline = "middle";

  // Radial text spans from inner hub edge to near the outer rim.
  const INNER_R = 30;
  const OUTER_R = radius - 10;
  const maxW = OUTER_R - INNER_R;

  const label = (isReward ? "⭐ " : "") + text;
  const displayText = truncateText(ctx, label, maxW);
  if (!displayText) {
    ctx.restore();
    return;
  }

  if (flip) {
    ctx.rotate(Math.PI);
    ctx.textAlign = "right";
    ctx.fillText(displayText, -(INNER_R + 2), 0);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(displayText, INNER_R + 2, 0);
  }
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

/**
 * Full redraw at a given wheel angle (radians, clockwise). Re-clears and
 * re-renders every frame — the spin is driven by canvas rotate(), not CSS
 * transform, so labels never inherit the container's skew.
 */
function drawWheel(
  ctx: CanvasRenderingContext2D,
  segments: WheelDisplayItem[],
  wheelAngle: number,
  display: number,
) {
  const center = display / 2;
  const radius = center - 6;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, display, display);

  if (segments.length === 0) {
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, TWO_PI);
    ctx.fillStyle = "#2a2a48";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("请添加任务", center, center);
    ctx.textBaseline = "alphabetic";
    return;
  }

  const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);

  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(wheelAngle);

  // Segments laid out clockwise starting at 12 o'clock (-90°), matching the
  // winner-rotation math in useSpinnerApp.
  let angle = -Math.PI / 2;
  segments.forEach((seg, i) => {
    const arc = (seg.weight / totalWeight) * TWO_PI;
    const end = angle + arc;
    const mid = angle + arc / 2;
    const pal = seg.type === "reward" ? PALETTE.reward : PALETTE.task;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, angle, end);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? pal.fill : pal.fillAlt;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 1;
    ctx.stroke();

    drawSegmentText(ctx, seg.title, mid, seg.type === "reward", arc, radius);
    angle = end;
  });

  ctx.restore();

  // Outer rim (drawn unrotated — a circle is rotation-invariant, but keeping
  // it crisp and separate from the spinning body).
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, TWO_PI);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

interface SpinnerWheelProps {
  segments: WheelDisplayItem[];
  isSpinning: boolean;
  canSpin: boolean;
  targetRotation: number;
  statsLine: string;
  skipCardsLine: string;
  /** When set, spin is blocked and this message is shown below the button. */
  blockReason?: string;
  /** Wheel diameter in px. */
  size?: number;
  onSpin(): void;
  onSpinComplete(normalizedRotation: number): void;
}

export function SpinnerWheel({
  segments,
  canSpin,
  targetRotation,
  statsLine,
  skipCardsLine,
  blockReason,
  size = 320,
  onSpin,
  onSpinComplete,
}: SpinnerWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // Last targetRotation we animated, to detect a fresh spin request.
  const handledTargetRef = useRef(0);
  // Current resting wheel angle in degrees (winner stays under the needle).
  const restDegRef = useRef(0);

  const CENTER = size / 2;
  const RADIUS = CENTER - 6;

  const draw = useCallback(
    (wheelDeg: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawWheel(ctx, segments, deg2rad(wheelDeg), size);
    },
    [segments, size],
  );

  // Static redraw whenever the segment set (or size) changes — hold the
  // current rest angle so a freshly loaded wheel keeps the last winner on top.
  useEffect(() => {
    draw(restDegRef.current);
  }, [draw]);

  // Animate a spin whenever targetRotation advances.
  useEffect(() => {
    if (targetRotation === handledTargetRef.current) return;
    handledTargetRef.current = targetRotation;

    const from = restDegRef.current;
    const travel = targetRotation - from; // clockwise degrees this spin
    // Pointer counter-rotates by whole turns so it lands pointing straight up
    // while moving at (very nearly) the wheel's angular speed, opposite way.
    const pointerTurns = Math.round(travel / 360) * 360;
    const duration = 3000 + Math.random() * 1000;
    const start = performance.now();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const norm = ((targetRotation % 360) + 360) % 360;
      restDegRef.current = norm;
      draw(norm);
      if (pointerRef.current) {
        pointerRef.current.style.transform = "translateX(-50%) rotate(0deg)";
      }
      onSpinComplete(norm);
    };

    const tick = (now: number) => {
      if (done) return;
      const t = Math.min((now - start) / duration, 1);
      const e = EASE_OUT_QUART(t);
      draw(from + travel * e);
      if (pointerRef.current) {
        pointerRef.current.style.transform = `translateX(-50%) rotate(${-pointerTurns * e}deg)`;
      }
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else finish();
    };

    rafRef.current = requestAnimationFrame(tick);
    // Safety net: requestAnimationFrame is paused while the window is hidden, so
    // guarantee the spin resolves (result modal appears, wheel settles) even if
    // the user tabs away mid-spin. The `done` guard keeps this idempotent with
    // the rAF path when the window is visible.
    const fallback = setTimeout(finish, duration + 250);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      clearTimeout(fallback);
    };
  }, [targetRotation, draw, onSpinComplete]);

  const dimmed = Boolean(blockReason);

  return (
    <div className="wheel-section">
      <div className="wheel-header">
        <h1 className="app-title">🎡 学习激励转盘</h1>
        <p className="app-subtitle">转起来，看看今天该做什么！</p>
      </div>

      <div
        className="wheel-wrapper"
        style={{ width: size, height: size, opacity: dimmed ? 0.4 : 1 }}
      >
        <canvas
          ref={canvasRef}
          id="wheel-canvas"
          width={size * DPR}
          height={size * DPR}
          style={{ width: size, height: size }}
        />

        {/* Counter-rotating needle: pivots at the centre, points up at rest. */}
        <div
          ref={pointerRef}
          className="wheel-needle"
          style={{ width: size, height: size }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <polygon
              points={`${CENTER},${CENTER - RADIUS + 6} ${CENTER - 7},${CENTER - 4} ${CENTER + 7},${CENTER - 4}`}
              fill="#EF4444"
            />
          </svg>
        </div>

        {/* Centre cap covers the segment convergence + needle pivot. */}
        <div className="wheel-cap" />
      </div>

      <div className="wheel-controls">
        <button id="spin-btn" className="spin-button" onClick={onSpin} disabled={!canSpin}>
          <span className="spin-icon">🎯</span>
          <span>开始转动！</span>
        </button>
        {blockReason && (
          <div className="spin-block-reason" id="spin-block-reason">
            ⚠️ {blockReason}
          </div>
        )}
        <div className="stats" id="stats-display">
          {statsLine}
          <br />
          <span className="skip-cards-stat">{skipCardsLine}</span>
        </div>
      </div>
    </div>
  );
}
