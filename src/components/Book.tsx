import Staff from "./Staff";
import { NOTE_NAMES, octaveOf, pitchClass, midiName, type ChordInfo } from "../lib/music";
import type { Song } from "../lib/songs";

export interface Playing {
  id: string;
  duration: number;
  run: number;
}

interface Props {
  held: number[];
  ringing: number[];
  chord: ChordInfo | null;
  recording: boolean;
  recSeconds: number;
  take: { duration: number; notes: number } | null;
  onRec: () => void;
  onPlayTake: () => void;
  onClear: () => void;
  songs: { song: Song; duration: number }[];
  playing: Playing | null;
  onSong: (id: string) => void;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const SPELLED: Record<string, string> = {
  "C♯": "C sharp",
  "D♯": "D sharp",
  "F♯": "F sharp",
  "G♯": "G sharp",
  "A♯": "A sharp",
};

function reading(sounding: number[], chord: ChordInfo | null) {
  if (sounding.length === 0) return { title: "Nothing yet", sub: "Press a key and it is written here.", idle: true };
  if (sounding.length === 1) {
    const m = sounding[0];
    const n = NOTE_NAMES[pitchClass(m)];
    return { title: SPELLED[n] ?? n, sub: `octave ${octaveOf(m)}`, idle: false };
  }
  if (chord) return { title: chord.spoken, sub: [...sounding].sort((a, b) => a - b).map(midiName).join("  "), idle: false };
  return {
    title: `${sounding.length} notes`,
    sub: [...sounding].sort((a, b) => a - b).map(midiName).join("  "),
    idle: false,
  };
}

export default function Book(p: Props) {
  const sounding = Array.from(new Set([...p.held, ...p.ringing]));
  const r = reading(p.held.length ? p.held : sounding, p.chord);
  const takePlaying = p.playing?.id === "take";

  return (
    <section className="book" aria-label="Music desk">
      <article className="page page-left">
        <header className="folio">
          <span>Now sounding</span>
          <span className="pageno">i</span>
        </header>

        <div className="left-grid">
          <Staff held={p.held} ringing={p.ringing} />

          <div className="reading">
            <h2 className={r.idle ? "idle" : ""}>{r.title}</h2>
            <p className="reading-sub">{r.sub}</p>

            <div className="recorder">
              <div className="recorder-btns">
                <button
                  type="button"
                  className={`inkbtn rec${p.recording ? " live" : ""}`}
                  onClick={p.onRec}
                  aria-pressed={p.recording}
                >
                  <i className="dot" />
                  {p.recording ? "Stop" : "Rec"}
                </button>
                <button
                  type="button"
                  className="inkbtn"
                  onClick={p.onPlayTake}
                  disabled={!p.take || p.recording}
                  aria-pressed={takePlaying}
                >
                  <i className={takePlaying ? "sq" : "tri"} />
                  {takePlaying ? "Stop" : "Play"}
                </button>
                <button type="button" className="inkbtn ghost" onClick={p.onClear} disabled={!p.take || p.recording}>
                  Clear
                </button>
              </div>
              <p className="recorder-status">
                {p.recording
                  ? `recording… ${fmt(p.recSeconds * 1000)}`
                  : p.take
                    ? `your take · ${fmt(p.take.duration)} · ${p.take.notes} notes`
                    : "record a take, then play it back"}
              </p>
              {takePlaying && p.playing && (
                <span className="bar" key={p.playing.run} style={{ ["--dur" as string]: `${p.playing.duration}ms` }} />
              )}
            </div>
          </div>
        </div>
      </article>

      <article className="page page-right">
        <header className="folio">
          <span>Repertoire</span>
          <span className="pageno">ii</span>
        </header>

        <ol className="toc">
          {p.songs.map(({ song, duration }) => {
            const on = p.playing?.id === song.id;
            return (
              <li key={song.id} className={on ? "toc-item is-playing" : "toc-item"}>
                <button type="button" onClick={() => p.onSong(song.id)} aria-pressed={on}>
                  <span className="toc-icon">
                    <i className={on ? "sq" : "tri"} />
                  </span>
                  <span className="toc-title">{song.title}</span>
                  <span className="toc-dots" />
                  <span className="toc-len">{fmt(duration)}</span>
                </button>
                <span className="toc-sub">
                  {song.composer}, {song.year} — {song.note}
                </span>
                {on && p.playing && (
                  <span className="bar" key={p.playing.run} style={{ ["--dur" as string]: `${p.playing.duration}ms` }} />
                )}
              </li>
            );
          })}
        </ol>


      </article>
    </section>
  );
}
