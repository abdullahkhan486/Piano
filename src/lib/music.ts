/* Note maths, staff geometry and chord naming. */

export const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

export const MIDI_MIN = 24; // C1
export const MIDI_MAX = 108; // C8

export const pitchClass = (m: number) => ((m % 12) + 12) % 12;
export const octaveOf = (m: number) => Math.floor(m / 12) - 1;
export const isBlackKey = (m: number) => [1, 3, 6, 8, 10].includes(pitchClass(m));
export const midiName = (m: number) => `${NOTE_NAMES[pitchClass(m)]}${octaveOf(m)}`;
export const midiFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** midi number of the nth white key counting up from a given C. */
export const whiteMidi = (lowC: number, i: number) =>
  lowC + Math.floor(i / 7) * 12 + WHITE_OFFSETS[i % 7];

/* ---------- Staff geometry ---------- */

// Letter index (C = 0 … B = 6) for every pitch class; sharps sit on the natural below.
const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

/** Diatonic step counted from C-1. C4 === 28, E4 === 30, G2 === 18. */
export const staffStep = (m: number) => octaveOf(m) * 7 + LETTER[pitchClass(m)];

/* ---------- Chords & intervals ---------- */

interface Template {
  sym: string;
  long: string;
  iv: number[];
}

const TEMPLATES: Template[] = [
  { sym: "", long: "major", iv: [0, 4, 7] },
  { sym: "m", long: "minor", iv: [0, 3, 7] },
  { sym: "dim", long: "diminished", iv: [0, 3, 6] },
  { sym: "aug", long: "augmented", iv: [0, 4, 8] },
  { sym: "sus2", long: "suspended 2nd", iv: [0, 2, 7] },
  { sym: "sus4", long: "suspended 4th", iv: [0, 5, 7] },
  { sym: "maj7", long: "major 7th", iv: [0, 4, 7, 11] },
  { sym: "7", long: "dominant 7th", iv: [0, 4, 7, 10] },
  { sym: "m7", long: "minor 7th", iv: [0, 3, 7, 10] },
  { sym: "m7♭5", long: "half-diminished", iv: [0, 3, 6, 10] },
  { sym: "dim7", long: "diminished 7th", iv: [0, 3, 6, 9] },
  { sym: "m(maj7)", long: "minor-major 7th", iv: [0, 3, 7, 11] },
  { sym: "6", long: "major 6th", iv: [0, 4, 7, 9] },
  { sym: "m6", long: "minor 6th", iv: [0, 3, 7, 9] },
  { sym: "add9", long: "add 9", iv: [0, 2, 4, 7] },
  { sym: "madd9", long: "minor add 9", iv: [0, 2, 3, 7] },
  { sym: "7sus4", long: "7th suspended 4th", iv: [0, 5, 7, 10] },
  { sym: "9", long: "dominant 9th", iv: [0, 2, 4, 7, 10] },
  { sym: "maj9", long: "major 9th", iv: [0, 2, 4, 7, 11] },
  { sym: "m9", long: "minor 9th", iv: [0, 2, 3, 7, 10] },
];

const INTERVALS = [
  "unison",
  "minor 2nd",
  "major 2nd",
  "minor 3rd",
  "major 3rd",
  "perfect 4th",
  "tritone",
  "perfect 5th",
  "minor 6th",
  "major 6th",
  "minor 7th",
  "major 7th",
];

export interface ChordInfo {
  symbol: string;
  spoken: string;
}

const key = (a: number[]) => a.join(",");
const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [key(t.iv), t]));

export function identify(notes: number[]): ChordInfo | null {
  if (notes.length < 2) return null;
  const sorted = [...notes].sort((a, b) => a - b);
  const bass = sorted[0];
  const bassPc = pitchClass(bass);

  const pcs = Array.from(new Set(sorted.map(pitchClass)));

  if (pcs.length === 1) {
    return { symbol: "8ve", spoken: "octave" };
  }

  if (pcs.length === 2) {
    const [a, b] = [sorted[0], sorted[sorted.length - 1]];
    const d = (b - a) % 12;
    const name = INTERVALS[d] ?? "interval";
    return { symbol: name, spoken: `${NOTE_NAMES[pitchClass(a)]} – ${NOTE_NAMES[pitchClass(b)]}` };
  }

  // Try the bass note as root first, then every other pitch class.
  const roots = [bassPc, ...pcs.filter((p) => p !== bassPc)];
  for (const root of roots) {
    const iv = Array.from(new Set(pcs.map((p) => (p - root + 12) % 12))).sort((x, y) => x - y);
    const t = TEMPLATE_MAP.get(key(iv));
    if (t) {
      const rootName = NOTE_NAMES[root];
      const slash = root !== bassPc ? `/${NOTE_NAMES[bassPc]}` : "";
      return {
        symbol: `${rootName}${t.sym}${slash}`,
        spoken: `${rootName} ${t.long}${slash ? `, bass ${NOTE_NAMES[bassPc]}` : ""}`,
      };
    }
  }
  return null;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
