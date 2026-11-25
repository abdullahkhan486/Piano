import { useEffect, useRef } from "react";
import { clamp } from "../lib/music";

interface Props {
  label: string;
  value: number; // 0..1
  onChange: (v: number) => void;
  initial: number;
  format: (v: number) => string;
}

const SWEEP = 270;
const TICKS = 11;

export default function Knob({ label, value, onChange, initial, format }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; x: number; v: number } | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  // wheel needs a non-passive listener to stop the page scrolling
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = e.deltaY < 0 ? 0.04 : -0.04;
      latest.current.onChange(clamp(latest.current.value + d, 0, 1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const angle = -SWEEP / 2 + value * SWEEP;

  return (
    <div className="knob">
      <div
        ref={ref}
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={format(value)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, x: e.clientX, v: value };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const delta = (d.y - e.clientY) / 150 + (e.clientX - d.x) / 400;
          onChange(clamp(d.v + delta, 0, 1));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => onChange(initial)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.04;
          let next: number | null = null;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") next = value + step;
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = value - step;
          if (e.key === "Home") next = 0;
          if (e.key === "End") next = 1;
          if (next !== null) {
            e.preventDefault();
            e.stopPropagation();
            onChange(clamp(next, 0, 1));
          }
        }}
      >
        <svg className="knob-scale" viewBox="-50 -50 100 100" aria-hidden="true">
          {Array.from({ length: TICKS }, (_, i) => {
            const a = -SWEEP / 2 + (i / (TICKS - 1)) * SWEEP;
            const lit = i / (TICKS - 1) <= value + 0.001;
            const major = i === 0 || i === TICKS - 1 || i === (TICKS - 1) / 2;
            return (
              <line
                key={i}
                x1="0"
                x2="0"
                y1={major ? -47 : -45}
                y2={-40}
                transform={`rotate(${a})`}
                className={lit ? "tick lit" : "tick"}
                strokeWidth={major ? 2.4 : 1.6}
              />
            );
          })}
        </svg>
        <div className="knob-cap" style={{ transform: `rotate(${angle}deg)` }}>
          <i className="knob-mark" />
        </div>
      </div>
      <span className="engrave knob-label">{label}</span>
      <output className="knob-val">{format(value)}</output>
    </div>
  );
}
