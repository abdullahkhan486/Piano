import { staffStep, midiName, isBlackKey } from "../lib/music";

/* A grand staff that writes down whatever you are holding.
 * Steps are diatonic: C4 = 28. Treble lines sit on 30…38, bass lines on 18…26. */

const W = 250;
const H = 200;
const BOTTOM_STEP = 14; // C2
const TOP_STEP = 44; // E6
const SH = 5.2; // px per diatonic step (half a staff space)
const Y_BOTTOM = H - 22;

const y = (step: number) => Y_BOTTOM - (step - BOTTOM_STEP) * SH;

const TREBLE = [30, 32, 34, 36, 38];
const BASS = [18, 20, 22, 24, 26];

const NOTE_X = 168;
const LEDGER_HALF = 12;

interface Placed {
  midi: number;
  step: number;
  sharp: boolean;
  shift: number; // +1 written an octave low (8va), -1 written an octave high (8vb)
  dx: number;
  ghost: boolean;
  accCol: number;
}

function place(midis: number[], ghosts: Set<number>): Placed[] {
  const out: Placed[] = [];
  const sorted = [...midis].sort((a, b) => a - b);
  let prevStep: number = -99;
  let prevDisplaced: boolean = false;
  const accSteps: number[][] = [];

  for (const midi of sorted) {
    let step: number = staffStep(midi);
    let shift = 0;
    if (step > TOP_STEP) {
      step -= 7 * Math.ceil((step - TOP_STEP) / 7);
      shift = 1;
    } else if (step < BOTTOM_STEP) {
      step += 7 * Math.ceil((BOTTOM_STEP - step) / 7);
      shift = -1;
    }
    const sharp = isBlackKey(midi);

    // neighbours a second apart can't share a column
    const displaced: boolean = step - prevStep <= 1 && !prevDisplaced;
    prevStep = step;
    prevDisplaced = displaced;

    // stagger accidentals so they don't collide
    let accCol = 0;
    if (sharp) {
      let c = 0;
      while (c < accSteps.length && !accSteps[c].every((s) => Math.abs(s - step) >= 6)) c++;
      accCol = c;
      (accSteps[c] ??= []).push(step);
    }

    out.push({ midi, step, sharp, shift, dx: displaced ? 12 : 0, ghost: ghosts.has(midi), accCol });
  }
  return out;
}

function ledgers(step: number): number[] {
  const lines: number[] = [];
  if (step >= 40) for (let s = 40; s <= step; s += 2) lines.push(s);
  else if (step <= 16) for (let s = 16; s >= step; s -= 2) lines.push(s);
  else if (step === 28) lines.push(28);
  return lines;
}

interface Props {
  held: number[];
  ringing: number[];
}

export default function Staff({ held, ringing }: Props) {
  const heldSet = new Set(held);
  const ghosts = new Set(ringing.filter((m) => !heldSet.has(m)));
  const all = Array.from(new Set([...held, ...ringing]));
  const notes = place(all, ghosts);

  const ledgerMap = new Map<number, Set<number>>();
  for (const n of notes) {
    for (const s of ledgers(n.step)) {
      const xs = ledgerMap.get(s) ?? new Set<number>();
      xs.add(NOTE_X + n.dx);
      ledgerMap.set(s, xs);
    }
  }

  const up = notes.some((n) => n.shift === 1);
  const down = notes.some((n) => n.shift === -1);

  const y1 = y(38);
  const y2 = y(18);
  const mid = (y1 + y2) / 2;

  return (
    <svg
      className="staff"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={all.length ? `Staff showing ${all.map(midiName).join(", ")}` : "Empty staff"}
    >
      <g className="staff-lines">
        {[...TREBLE, ...BASS].map((s) => (
          <line key={s} x1={18} x2={W - 14} y1={y(s)} y2={y(s)} />
        ))}
        <line x1={18} x2={18} y1={y1} y2={y2} />
        <line x1={W - 14} x2={W - 14} y1={y1} y2={y2} />
        <line className="thick" x1={W - 19} x2={W - 19} y1={y1} y2={y2} />
      </g>

      <path
        className="brace"
        d={`M 14 ${y1} C 4 ${y1 + 10} 5 ${mid - 18} 8 ${mid} C 5 ${mid + 18} 4 ${y2 - 10} 14 ${y2}`}
      />

      <text className="clef" x={22} y={y(32) + 10} fontSize={SH * 2 * 4.35}>
        {"\u{1D11E}"}
      </text>
      <text className="clef" x={22} y={y(24) + 29.3} fontSize={SH * 2 * 4.0}>
        {"\u{1D122}"}
      </text>

      <g className="staff-lines ledger">
        {Array.from(ledgerMap.entries()).flatMap(([s, xs]) =>
          Array.from(xs).map((x) => (
            <line key={`${s}-${x}`} x1={x - LEDGER_HALF} x2={x + LEDGER_HALF} y1={y(s)} y2={y(s)} />
          )),
        )}
      </g>

      {notes.map((n) => (
        <g key={n.midi} className={n.ghost ? "note ghost" : "note"}>
          {n.sharp && (
            <text className="accidental" x={NOTE_X - 19 - n.accCol * 10} y={y(n.step) + 8} fontSize="27">
              {"\u266F"}
            </text>
          )}
          <g transform={`translate(${NOTE_X + n.dx} ${y(n.step)})`}>
            <ellipse className="head" rx="6.8" ry="4.5" transform="rotate(-18)" />
            <ellipse className="hole" rx="2.5" ry="3.6" transform="rotate(34)" />
          </g>
        </g>
      ))}

      {up && (
        <text className="ottava" x={NOTE_X - 14} y={y(TOP_STEP) - 8}>
          8va
        </text>
      )}
      {down && (
        <text className="ottava" x={NOTE_X - 14} y={y(BOTTOM_STEP) + 20}>
          8vb
        </text>
      )}
      {all.length === 0 && (
        <text className="rest-hint" x={NOTE_X} y={y(28) + 5} textAnchor="middle">
          tacet
        </text>
      )}
    </svg>
  );
}
