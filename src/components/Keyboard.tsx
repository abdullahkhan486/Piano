import { useMemo, useRef, type CSSProperties, type PointerEvent } from "react";
import { clamp, midiName, pitchClass, whiteMidi, MIDI_MIN } from "../lib/music";

interface Props {
  lowC: number;
  whites: number;
  down: ReadonlySet<number>;
  sounding: ReadonlySet<number>;
  labels: ReadonlyMap<number, string>;
  onPress: (midi: number, vel: number, source: string) => void;
  onRelease: (midi: number, source: string) => void;
}

interface KeyDef {
  midi: number;
  black: boolean;
  left: number;
  width: number;
  center: number;
}

// black keys sit slightly off-centre on a real keyboard
const BLACK_SHIFT: Record<number, number> = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };
const HAS_SHARP = new Set([0, 2, 5, 7, 9]);

export default function Keyboard({ lowC, whites, down, sounding, labels, onPress, onRelease }: Props) {
  const keysRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, number | null>());

  const { white, black } = useMemo(() => {
    const ww = 100 / whites;
    const white: KeyDef[] = [];
    const black: KeyDef[] = [];
    for (let i = 0; i < whites; i++) {
      const midi = whiteMidi(lowC, i);
      white.push({ midi, black: false, left: i * ww, width: ww, center: (i + 0.5) * ww });
      if (i + 1 < whites && HAS_SHARP.has(pitchClass(midi))) {
        const bm = midi + 1;
        const bw = ww * 0.6;
        const center = (i + 1) * ww + BLACK_SHIFT[pitchClass(bm)] * ww;
        black.push({ midi: bm, black: true, left: center - bw / 2, width: bw, center });
      }
    }
    return { white, black };
  }, [lowC, whites]);

  const hit = (e: { clientX: number; clientY: number }) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const k = el?.closest<HTMLElement>("[data-midi]");
    if (!k || !keysRef.current?.contains(k)) return null;
    const r = k.getBoundingClientRect();
    const rel = clamp((e.clientY - r.top) / r.height, 0, 1);
    // strike near the front edge of the key and it speaks louder
    return { midi: Number(k.dataset.midi), vel: 0.26 + 0.74 * rel };
  };

  const end = (e: PointerEvent) => {
    const cur = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (cur != null) onRelease(cur, `p${e.pointerId}`);
  };

  const all = [...white, ...black];

  return (
    <div className="keyboard">
      <div className="soundboard" aria-hidden="true">
        {all.map((k) => {
          const t = (k.midi - MIDI_MIN) / 84;
          const style = {
            left: `${k.center}%`,
            "--h": (1 - t * 0.42).toFixed(3),
            "--t": `${(3.4 - t * 2.4).toFixed(2)}px`,
          } as CSSProperties;
          const cls = ["str", k.midi < 47 ? "wound" : "", sounding.has(k.midi) ? "on" : ""].join(" ");
          return <i key={k.midi} className={cls} style={style} />;
        })}
      </div>
      <div className="felt" aria-hidden="true" />

      <div
        ref={keysRef}
        className="keys"
        role="group"
        aria-label="Piano keys"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const h = hit(e);
          pointers.current.set(e.pointerId, h ? h.midi : null);
          if (h) onPress(h.midi, h.vel, `p${e.pointerId}`);
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          const cur = pointers.current.get(e.pointerId) ?? null;
          const h = hit(e);
          const next = h ? h.midi : null;
          if (next === cur) return;
          if (cur !== null) onRelease(cur, `p${e.pointerId}`);
          pointers.current.set(e.pointerId, next);
          if (h) onPress(h.midi, h.vel, `p${e.pointerId}`);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        {all.map((k) => {
          const label = labels.get(k.midi);
          return (
            <div
              key={k.midi}
              data-midi={k.midi}
              className={[k.black ? "bk" : "wk", down.has(k.midi) ? "is-down" : ""].join(" ")}
              style={{ left: `${k.left}%`, width: `${k.width}%` }}
            >
              <span className="face">{label && <span className="cap">{label}</span>}</span>
            </div>
          );
        })}
      </div>

      <div className="slip" aria-hidden="true">
        {white
          .filter((k) => pitchClass(k.midi) === 0)
          .map((k) => (
            <span key={k.midi} className={k.midi === 60 ? "mark mid" : "mark"} style={{ left: `${k.left}%` }}>
              {midiName(k.midi)}
              {k.midi === 60 && <em>middle C</em>}
            </span>
          ))}
      </div>
    </div>
  );
}
