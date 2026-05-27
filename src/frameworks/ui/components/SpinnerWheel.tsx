import { useRef, useEffect, useCallback } from "react";
import type { WheelDisplayItem } from "../../../interface-adapters/viewModels/SpinnerViewModel";

const DPR = window.devicePixelRatio || 1;
const DISPLAY = 390;
const CENTER = DISPLAY / 2;
const RADIUS = CENTER - 6;

function darken(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `rgb(${r},${g},${b})`;
}

/**
 * Truncates text to fit within maxWidth using a binary-search approach.
 * Returns empty string if even a single character + ellipsis doesn't fit.
 */
function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
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

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  midAngle: number,
  isReward: boolean,
  arcAngle: number
) {
  // Skip segments too narrow to render any readable text.
  if (arcAngle < Math.PI / 18) return;

  ctx.save();
  ctx.translate(CENTER, CENTER);
  ctx.rotate(midAngle);

  const norm = ((midAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const flip = norm > Math.PI / 2 && norm < (Math.PI * 3) / 2;

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3;

  // Scale font size with available arc so text never overflows its segment.
  const fontSize =
    arcAngle < Math.PI / 9  ? 9  :
    arcAngle < Math.PI / 6  ? 11 :
    arcAngle < Math.PI / 4  ? 12 : 13;
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", Arial, sans-serif`;

  // Radial text spans from inner hub edge to near the outer rim.
  const INNER_R = 32;
  const OUTER_R = RADIUS - 8;
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
    ctx.fillText(displayText, -(INNER_R + 2), 4);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(displayText, INNER_R + 2, 4);
  }
  ctx.restore();
}

function drawWheelOnCanvas(
  ctx: CanvasRenderingContext2D,
  segments: WheelDisplayItem[]
) {
  ctx.clearRect(0, 0, DISPLAY, DISPLAY);

  if (segments.length === 0) {
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2a48";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("请添加任务", CENTER, CENTER);
    ctx.textBaseline = "alphabetic";
    return;
  }

  const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);
  let angle = -Math.PI / 2;

  segments.forEach((seg, i) => {
    const arc = (seg.weight / totalWeight) * Math.PI * 2;
    const end = angle + arc;
    const mid = angle + arc / 2;

    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, RADIUS, angle, end);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? seg.color : darken(seg.color, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(10, 10, 30, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    drawText(ctx, seg.title, mid, seg.type === "reward", arc);
    angle = end;
  });

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.13)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 20, 0, Math.PI * 2);
  ctx.fillStyle = "#12122a";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();
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
  onSpin(): void;
  onSpinComplete(normalizedRotation: number): void;
}

export function SpinnerWheel({
  segments,
  isSpinning,
  canSpin,
  targetRotation,
  statsLine,
  skipCardsLine,
  blockReason,
  onSpin,
  onSpinComplete,
}: SpinnerWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevTargetRef = useRef(0);

  // Draw wheel whenever segments change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawWheelOnCanvas(ctx, segments);
  }, [segments]);

  // Animate spin when targetRotation changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || targetRotation === prevTargetRef.current) return;
    prevTargetRef.current = targetRotation;

    canvas.style.transform = `rotate(${targetRotation}deg)`;

    const timer = setTimeout(() => {
      if (!canvas) return;
      const norm = targetRotation % 360;
      canvas.style.transition = "none";
      canvas.style.transform = `rotate(${norm}deg)`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          canvas.style.transition =
            "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)";
        })
      );
      onSpinComplete(norm);
    }, 4150);

    return () => clearTimeout(timer);
  }, [targetRotation, onSpinComplete]);

  return (
    <div className="wheel-section">
      <div className="wheel-header">
        <h1 className="app-title">🎡 学习激励转盘</h1>
        <p className="app-subtitle">转起来，看看今天该做什么！</p>
      </div>

      <div className="wheel-wrapper">
        <div className="pointer">▼</div>
        <canvas
          ref={canvasRef}
          id="wheel-canvas"
          width={DISPLAY * DPR}
          height={DISPLAY * DPR}
          style={{
            width: DISPLAY,
            height: DISPLAY,
            transition: "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)",
          }}
        />
      </div>

      <div className="wheel-controls">
        <button
          id="spin-btn"
          className="spin-button"
          onClick={onSpin}
          disabled={!canSpin}
        >
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
