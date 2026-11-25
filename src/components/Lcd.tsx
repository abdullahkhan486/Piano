import { useEffect, useRef } from "react";
import { midiFreq, NOTE_NAMES, octaveOf, pitchClass, type ChordInfo } from "../lib/music";

interface Props {
  last: number | null;
  count: number;
  chord: ChordInfo | null;
  voice: string;
  range: string;
  pedal: boolean;
  recording: boolean;
  playing: boolean;
  analyser: () => AnalyserNode | null;
}

export default function Lcd({ last, count, chord, voice, range, pedal, recording, playing, analyser }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const getAnalyser = useRef(analyser);
  getAnalyser.current = analyser;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    let raf = 0;
    let buf: Float32Array<ArrayBuffer> | null = null;

    const fit = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);

    const ink = "#1f2615";
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { width: w, height: h } = cv;
      g.clearRect(0, 0, w, h);
      const an = getAnalyser.current();
      g.lineWidth = Math.max(1.5, w / 150);
      g.strokeStyle = ink;
      g.lineJoin = "round";
      g.beginPath();
      if (an) {
        if (!buf || buf.length !== an.fftSize) buf = new Float32Array(new ArrayBuffer(an.fftSize * 4));
        an.getFloatTimeDomainData(buf);
        // find a rising zero crossing so the trace holds still
        let start = 0;
        for (let i = 1; i < buf.length / 2; i++) {
          if (buf[i - 1] < 0 && buf[i] >= 0) {
            start = i;
            break;
          }
        }
        const n = Math.min(512, buf.length - start);
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * w;
          const yy = h / 2 - buf[start + i] * h * 1.1;
          if (i === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
      } else {
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
      }
      g.stroke();
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const name = last !== null ? NOTE_NAMES[pitchClass(last)] : null;
  const oct = last !== null ? octaveOf(last) : null;

  return (
    <div className="lcd" aria-live="polite">
      <div className="lcd-body">
        <div className="lcd-cell lcd-note-cell">
          <span className="lcd-label">Note</span>
          <span className="lcd-note">
            {name ? (
              <>
                {name}
                <sub>{oct}</sub>
              </>
            ) : (
              <span className="lcd-dash">– –</span>
            )}
          </span>
        </div>

        <div className="lcd-cell lcd-chord-cell">
          <span className="lcd-label">{count > 1 ? "Reading" : "Pitch"}</span>
          <span className="lcd-chord">
            {count > 1 ? (chord ? chord.symbol : `${count} notes`) : last !== null ? `${midiFreq(last).toFixed(1)} Hz` : "–"}
          </span>
          <span className="lcd-sub">{count > 1 && chord ? chord.spoken : last !== null ? `MIDI ${last}` : "touch a key"}</span>
        </div>

        <canvas ref={canvas} className="lcd-scope" aria-hidden="true" />
      </div>

      <div className="lcd-status">
        <span>{voice}</span>
        <span>{range}</span>
        <span className={pedal ? "on" : ""}>Ped</span>
        <span className={recording ? "on blink" : ""}>Rec</span>
        <span className={playing ? "on" : ""}>Play</span>
      </div>
    </div>
  );
}
