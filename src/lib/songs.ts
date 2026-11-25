/* A small repertoire, written in a compact notation:
 *   "E4/1"        a note and its length in units
 *   "C3+G3/4"     a chord
 *   "r/2"         a rest
 *   "|"           bar line (ignored, just for reading)
 */

export type TimedEvent =
  | { t: number; type: "on"; midi: number; vel: number }
  | { t: number; type: "off"; midi: number }
  | { t: number; type: "pedal"; down: boolean };

interface Part {
  seq: string;
  vel: number;
  /** Multiplier on written length before the key is let go. */
  legato?: number;
}

export interface Song {
  id: string;
  title: string;
  composer: string;
  year: string;
  note: string;
  /** milliseconds per written unit */
  step: number;
  parts: Part[];
  pedal?: { bar: number; offset?: number };
}

const BASE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseNote(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`Bad note: ${s}`);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + BASE[m[1]] + acc;
}

/** an eight-note broken chord, twice, as in the C major prelude */
const arp = (a: string, b: string, c: string, d: string, e: string) => {
  const half = `${a}/1 ${b}/1 ${c}/1 ${d}/1 ${e}/1 ${c}/1 ${d}/1 ${e}/1`;
  return `${half} ${half} | `;
};

export const SONGS: Song[] = [
  {
    id: "gymnopedie",
    title: "Gymnopédie No. 1",
    composer: "Erik Satie",
    year: "1888",
    note: "opening, with pedal",
    step: 900,
    pedal: { bar: 3 },
    parts: [
      {
        vel: 0.5,
        legato: 1.0,
        seq: "G2/3 | D2/3 | G2/3 | D2/3 | G2/3 | D2/3 | G2/3 | D2/3 | G2/3 | D2/3 | G2/3 | D2/3 | G2/3 | D2/6",
      },
      {
        vel: 0.42,
        legato: 0.9,
        seq:
          "r/1 B3+D4+F#4/1 B3+D4+F#4/1 | r/1 A3+C#4+F#4/1 A3+C#4+F#4/1 | " +
          "r/1 B3+D4+F#4/1 B3+D4+F#4/1 | r/1 A3+C#4+F#4/1 A3+C#4+F#4/1 | " +
          "r/1 B3+D4+F#4/1 B3+D4+F#4/1 | r/1 A3+C#4+F#4/1 A3+C#4+F#4/1 | " +
          "r/1 B3+D4+F#4/1 B3+D4+F#4/1 | r/1 A3+C#4+F#4/1 A3+C#4+F#4/1 | " +
          "r/1 B3+D4+F#4/1 B3+D4+F#4/1 | r/1 A3+C#4+F#4/1 A3+C#4+F#4/1 | " +
          "r/1 B3+D4+F#4/1 B3+D4+F#4/1 | r/1 A3+C#4+F#4/1 A3+C#4+F#4/1 | " +
          "r/1 B3+D4+F#4/1 B3+D4+F#4/1",
      },
      {
        vel: 0.62,
        legato: 1.0,
        seq:
          "r/12 | F#5/2 A5/1 | G5/1 F#5/1 C#5/1 | B4/1 C#5/1 D5/1 | A4/3 | " +
          "F#5/3 | F#5/2 A5/1 | G5/1 F#5/1 C#5/1 | B4/1 C#5/1 D5/1 | A4/3 | " +
          "D4+F#4+A4+D5/6",
      },
    ],
  },
  {
    id: "prelude",
    title: "Prelude in C, BWV 846",
    composer: "J. S. Bach",
    year: "1722",
    note: "bars 1–8",
    step: 150,
    parts: [
      {
        vel: 0.46,
        legato: 0.98,
        seq: "C3/16 | C3/16 | B2/16 | C3/16 | C3/16 | C3/16 | B2/16 | B2/16 | C2+C3/32",
      },
      {
        vel: 0.56,
        legato: 3.4,
        seq:
          arp("C4", "E4", "G4", "C5", "E5") +
          arp("C4", "D4", "A4", "D5", "F5") +
          arp("B3", "D4", "G4", "D5", "F5") +
          arp("C4", "E4", "G4", "C5", "E5") +
          arp("C4", "E4", "A4", "C5", "E5") +
          arp("C4", "D4", "F#4", "A4", "D5") +
          arp("B3", "D4", "G4", "B4", "D5") +
          arp("B3", "C4", "E4", "G4", "C5") +
          "C4+E4+G4/2 C5/1 E5/29",
      },
    ],
  },
  {
    id: "elise",
    title: "Für Elise",
    composer: "L. van Beethoven",
    year: "1810",
    note: "the theme",
    step: 135,
    pedal: { bar: 6, offset: 2 },
    parts: [
      {
        vel: 0.66,
        legato: 0.92,
        seq:
          "E5/1 D#5/1 | E5/1 D#5/1 E5/1 B4/1 D5/1 C5/1 | A4/2 r/1 C4/1 E4/1 A4/1 | B4/2 r/1 E4/1 G#4/1 B4/1 | C5/2 r/1 E4/1 E5/1 D#5/1 | " +
          "E5/1 D#5/1 E5/1 B4/1 D5/1 C5/1 | A4/2 r/1 C4/1 E4/1 A4/1 | B4/2 r/1 E4/1 C5/1 B4/1 | A4/6",
      },
      {
        vel: 0.42,
        legato: 1.7,
        seq:
          "r/2 | r/6 | A2/2 E3/2 A3/2 | E2/2 E3/2 G#3/2 | A2/2 E3/2 A3/2 | " +
          "r/6 | A2/2 E3/2 A3/2 | E2/2 E3/2 G#3/2 | A2+A3/6",
      },
    ],
  },
  {
    id: "ode",
    title: "Ode to Joy",
    composer: "L. van Beethoven",
    year: "1824",
    note: "from the Ninth",
    step: 460,
    parts: [
      {
        vel: 0.7,
        legato: 0.9,
        seq:
          "E4/1 E4/1 F4/1 G4/1 | G4/1 F4/1 E4/1 D4/1 | C4/1 C4/1 D4/1 E4/1 | E4/1.5 D4/.5 D4/2 | " +
          "E4/1 E4/1 F4/1 G4/1 | G4/1 F4/1 E4/1 D4/1 | C4/1 C4/1 D4/1 E4/1 | D4/1.5 C4/.5 C4/2 | " +
          "D4/1 D4/1 E4/1 C4/1 | D4/1 E4/.5 F4/.5 E4/1 C4/1 | D4/1 E4/.5 F4/.5 E4/1 D4/1 | C4/1 D4/1 G3/2 | " +
          "E4/1 E4/1 F4/1 G4/1 | G4/1 F4/1 E4/1 D4/1 | C4/1 C4/1 D4/1 E4/1 | D4/1.5 C4/.5 C4/4",
      },
      {
        vel: 0.4,
        legato: 0.95,
        seq:
          "C3+G3/4 | C3+G3/4 | C3+G3/4 | G2+D3/4 | " +
          "C3+G3/4 | C3+G3/4 | C3+G3/4 | G2+D3/2 C3+G3/2 | " +
          "G2+D3/4 | C3+G3/4 | G2+D3/4 | C3+G3/2 G2+D3/2 | " +
          "C3+G3/4 | C3+G3/4 | C3+G3/4 | G2+D3/2 C2+C3+G3/4",
      },
    ],
  },
];

export interface Compiled {
  events: TimedEvent[];
  duration: number;
}

export function compile(song: Song): Compiled {
  const events: TimedEvent[] = [];
  const notes: { midi: number; t0: number; t1: number; vel: number }[] = [];
  let end = 0;

  for (const part of song.parts) {
    let cursor = 0;
    const legato = part.legato ?? 0.94;
    for (const tok of part.seq.split(/\s+/)) {
      if (!tok || tok === "|") continue;
      const [names, lenStr] = tok.split("/");
      const len = Number(lenStr ?? 1);
      if (names !== "r") {
        const t0 = cursor * song.step;
        const t1 = (cursor + len * legato) * song.step;
        for (const n of names.split("+")) notes.push({ midi: parseNote(n), t0, t1, vel: part.vel });
      }
      cursor += len;
    }
    end = Math.max(end, cursor);
  }

  // a held key must be let go before the same key is struck again
  notes.sort((a, b) => a.midi - b.midi || a.t0 - b.t0);
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const next = notes[i + 1];
    // lift the key a hair early so the re-strike is visible as well as audible
    if (next && next.midi === n.midi) n.t1 = Math.min(n.t1, Math.max(n.t0 + 30, next.t0 - 45));
    events.push({ t: n.t0, type: "on", midi: n.midi, vel: n.vel });
    events.push({ t: n.t1, type: "off", midi: n.midi });
  }

  const total = end * song.step;

  if (song.pedal) {
    const { bar, offset = 0 } = song.pedal;
    events.push({ t: 0, type: "pedal", down: true });
    for (let u = offset; u < end; u += bar) {
      if (u > 0) {
        events.push({ t: u * song.step - 70, type: "pedal", down: false });
        events.push({ t: u * song.step + 10, type: "pedal", down: true });
      }
    }
    events.push({ t: total + 600, type: "pedal", down: false });
  }

  const order = { pedal: 0, off: 1, on: 2 } as const;
  events.sort((a, b) => a.t - b.t || order[a.type] - order[b.type]);

  const last = events.length ? events[events.length - 1].t : 0;
  return { events, duration: Math.max(total, last) };
}
