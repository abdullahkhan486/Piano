import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Keyboard from "./components/Keyboard";
import Knob from "./components/Knob";
import Lcd from "./components/Lcd";
import Book, { type Playing } from "./components/Book";
import { PianoEngine, VOICES, type VoiceId } from "./lib/engine";
import { clamp, identify, midiName, whiteMidi, MIDI_MAX, MIDI_MIN } from "./lib/music";
import { SONGS, compile, type TimedEvent } from "./lib/songs";

/* ---------- computer keyboard layout ---------- */

// two rows, the way a tracker or DAW does it. Offsets are semitones from the row's C.
const LOWER: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
};
const UPPER: Record<string, number> = {
  KeyQ: 0, Digit2: 1, KeyW: 2, Digit3: 3, KeyE: 4, KeyR: 5, Digit5: 6, KeyT: 7, Digit6: 8, KeyY: 9, Digit7: 10, KeyU: 11,
  KeyI: 12, Digit9: 13, KeyO: 14, Digit0: 15, KeyP: 16, BracketLeft: 17, Equal: 18, BracketRight: 19,
};
const PUNCT: Record<string, string> = {
  Comma: ",", Period: ".", Slash: "/", Semicolon: ";", BracketLeft: "[", BracketRight: "]", Equal: "=",
};
const caption = (code: string) =>
  code.startsWith("Key") ? code.slice(3) : code.startsWith("Digit") ? code.slice(5) : (PUNCT[code] ?? "");

const codeToMidi = (code: string, base: number): number | null => {
  if (code in LOWER) return base + LOWER[code];
  if (code in UPPER) return base + 12 + UPPER[code];
  return null;
};

/* ---------- layout helpers ---------- */

const lastMidiFor = (lowC: number, whites: number) => whiteMidi(lowC, whites - 1);
const maxOctFor = (whites: number) => {
  let o = 7;
  while (o > 1 && lastMidiFor(12 * (o + 1), whites) > MIDI_MAX) o--;
  return o;
};
const defaultOctFor = (whites: number) => (whites >= 29 ? 2 : 3);

type Src = string;
interface Player {
  events: TimedEvent[];
  i: number;
  held: Set<number>;
  pedal: boolean;
  timer: number;
  t0: number;
}

const pct = (v: number) => (v * 10).toFixed(1);

export default function App() {
  const [engine] = useState(() => new PianoEngine());

  /* what is sounding */
  const [down, setDown] = useState<ReadonlySet<number>>(new Set());
  const [sustained, setSustained] = useState<ReadonlySet<number>>(new Set());
  const [last, setLast] = useState<number | null>(null);
  const [pedalOn, setPedalOn] = useState(false);

  /* panel */
  const [voice, setVoice] = useState<VoiceId>("upright");
  const [volume, setVolume] = useState(0.7);
  const [room, setRoom] = useState(0.3);
  const [tone, setTone] = useState(0.75);

  /* layout */
  const [width, setWidth] = useState(1100);
  const [startOct, setStartOct] = useState<number | null>(null);
  const whites = clamp(Math.floor(width / (width < 600 ? 34 : 33)), 8, 36);
  const maxOct = maxOctFor(whites);
  const oct = clamp(startOct ?? defaultOctFor(whites), 1, maxOct);
  const lowC = 12 * (oct + 1);
  const highMidi = lastMidiFor(lowC, whites);
  const lowerBase = lowC + (whites >= 22 ? 12 : 0);

  /* recording & playback */
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [take, setTake] = useState<{ events: TimedEvent[]; duration: number; notes: number } | null>(null);
  const [playing, setPlaying] = useState<Playing | null>(null);

  const holders = useRef(new Map<number, Set<Src>>());
  const sustainedRef = useRef(new Set<number>());
  const pedalSources = useRef(new Set<Src>());
  const rec = useRef<{ start: number; events: TimedEvent[]; timer: number } | null>(null);
  const player = useRef<Player | null>(null);
  const runs = useRef(0);
  const kbd = useRef(new Map<string, number>());
  const live = useRef({ lowerBase, maxOct, defaultOct: defaultOctFor(whites) });
  live.current = { lowerBase, maxOct, defaultOct: defaultOctFor(whites) };

  const compiled = useMemo(() => SONGS.map((song) => ({ song, ...compile(song) })), []);

  /* ---------- core note handling ---------- */

  const sync = useCallback(() => {
    setDown(new Set(holders.current.keys()));
    setSustained(new Set(sustainedRef.current));
  }, []);

  const press = useCallback(
    (midi: number, vel: number, src: Src) => {
      const set = holders.current.get(midi) ?? new Set<Src>();
      if (set.has(src)) return;
      set.add(src);
      holders.current.set(midi, set);
      sustainedRef.current.delete(midi);
      engine.noteOn(midi, vel);
      const r = rec.current;
      if (r && !src.startsWith("play")) r.events.push({ t: performance.now() - r.start, type: "on", midi, vel });
      setLast(midi);
      sync();
    },
    [engine, sync],
  );

  const release = useCallback(
    (midi: number, src: Src) => {
      const set = holders.current.get(midi);
      if (!set || !set.delete(src)) return;
      if (set.size > 0) return;
      holders.current.delete(midi);
      if (pedalSources.current.size > 0) sustainedRef.current.add(midi);
      else engine.noteOff(midi);
      const r = rec.current;
      if (r && !src.startsWith("play")) r.events.push({ t: performance.now() - r.start, type: "off", midi });
      sync();
    },
    [engine, sync],
  );

  const pedal = useCallback(
    (on: boolean, src: Src) => {
      const ps = pedalSources.current;
      const before = ps.size > 0;
      if (on) ps.add(src);
      else ps.delete(src);
      const after = ps.size > 0;
      if (before === after) return;
      setPedalOn(after);
      const r = rec.current;
      if (r && !src.startsWith("play")) r.events.push({ t: performance.now() - r.start, type: "pedal", down: after });
      if (!after) {
        for (const m of sustainedRef.current) if (!holders.current.has(m)) engine.noteOff(m);
        sustainedRef.current.clear();
      }
      sync();
    },
    [engine, sync],
  );

  /* ---------- playback ---------- */

  const stopPlayback = useCallback(() => {
    const p = player.current;
    if (!p) return;
    window.clearInterval(p.timer);
    player.current = null;
    for (const m of p.held) release(m, "play");
    if (p.pedal) pedal(false, "play");
    setPlaying(null);
  }, [release, pedal]);

  const startPlayback = useCallback(
    (id: string, events: TimedEvent[], duration: number) => {
      stopPlayback();
      engine.ensure();
      const p: Player = { events, i: 0, held: new Set(), pedal: false, timer: 0, t0: performance.now() + 160 };
      p.timer = window.setInterval(() => {
        const el = performance.now() - p.t0;
        while (p.i < events.length && events[p.i].t <= el) {
          const ev = events[p.i++];
          if (ev.type === "on") {
            p.held.add(ev.midi);
            press(ev.midi, ev.vel, "play");
          } else if (ev.type === "off") {
            p.held.delete(ev.midi);
            release(ev.midi, "play");
          } else {
            p.pedal = ev.down;
            pedal(ev.down, "play");
          }
        }
        if (p.i >= events.length && el > duration + 700) stopPlayback();
      }, 8);
      player.current = p;
      runs.current += 1;
      setPlaying({ id, duration, run: runs.current });
    },
    [engine, press, release, pedal, stopPlayback],
  );

  /* ---------- recording ---------- */

  const toggleRec = useCallback(() => {
    const r = rec.current;
    if (!r) {
      stopPlayback();
      engine.ensure();
      const timer = window.setInterval(() => {
        if (rec.current) setRecSeconds((performance.now() - rec.current.start) / 1000);
      }, 250);
      rec.current = { start: performance.now(), events: [], timer };
      setRecSeconds(0);
      setRecording(true);
      return;
    }
    window.clearInterval(r.timer);
    rec.current = null;
    const dur = performance.now() - r.start;
    for (const m of holders.current.keys()) r.events.push({ t: dur, type: "off", midi: m });
    if (pedalSources.current.size) r.events.push({ t: dur, type: "pedal", down: false });
    const notes = r.events.filter((e) => e.type === "on").length;
    setTake(notes ? { events: r.events, duration: dur + 400, notes } : null);
    setRecording(false);
  }, [engine, stopPlayback]);

  /* ---------- panel → engine ---------- */

  useEffect(() => engine.setVoice(voice), [engine, voice]);
  useEffect(() => engine.setVolume(volume), [engine, volume]);
  useEffect(() => engine.setRoom(room), [engine, room]);
  useEffect(() => engine.setTone(tone), [engine, tone]);

  /* ---------- computer keyboard ---------- */

  useEffect(() => {
    const shift = (d: number) =>
      setStartOct((cur) => clamp((cur ?? live.current.defaultOct) + d, 1, live.current.maxOct));

    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) pedal(true, "kbd");
        return;
      }
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (t?.getAttribute("role") === "slider") return;
        e.preventDefault();
        if (!e.repeat) shift(e.code === "ArrowRight" ? 1 : -1);
        return;
      }
      const m = codeToMidi(e.code, live.current.lowerBase);
      if (m === null) return;
      e.preventDefault();
      if (e.repeat || kbd.current.has(e.code)) return;
      if (m < MIDI_MIN || m > MIDI_MAX) return;
      kbd.current.set(e.code, m);
      press(m, e.shiftKey ? 0.96 : 0.68, `k:${e.code}`);
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        pedal(false, "kbd");
        return;
      }
      const m = kbd.current.get(e.code);
      if (m === undefined) return;
      kbd.current.delete(e.code);
      release(m, `k:${e.code}`);
    };

    const onBlur = () => {
      for (const [code, m] of kbd.current) release(m, `k:${code}`);
      kbd.current.clear();
      pedal(false, "kbd");
    };

    // mobile browsers only unlock audio from certain gestures
    const unlock = () => void engine.ensure();

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerup", unlock, { passive: true });
    window.addEventListener("touchend", unlock, { passive: true });
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("touchend", unlock);
    };
  }, [engine, press, release, pedal]);

  useEffect(
    () => () => {
      if (player.current) window.clearInterval(player.current.timer);
      if (rec.current) window.clearInterval(rec.current.timer);
      engine.allOff();
    },
    [engine],
  );

  /* ---------- measure the keybed ---------- */

  const roRef = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    roRef.current = ro;
  }, []);

  /* ---------- derived ---------- */

  const sounding = useMemo(() => Array.from(new Set([...down, ...sustained])), [down, sustained]);
  const chord = useMemo(() => identify(sounding), [sounding]);

  const labels = useMemo(() => {
    const map = new Map<number, string>();
    const add = (table: Record<string, number>, base: number, onlyFree: boolean) => {
      for (const code of Object.keys(table)) {
        const m = base + table[code];
        if (onlyFree && map.has(m)) continue;
        map.set(m, caption(code));
      }
    };
    add(UPPER, lowerBase + 12, false);
    add(LOWER, lowerBase, true);
    return map;
  }, [lowerBase]);

  const shiftRange = (d: number) => setStartOct((cur) => clamp((cur ?? defaultOctFor(whites)) + d, 1, maxOct));
  const voiceLabel = VOICES.find((v) => v.id === voice)?.label ?? "";

  return (
    <div className="stage">
      <main className="cabinet">
        <div className="fascia">
          <div className="plate">
            <i className="screw tl" />
            <i className="screw tr" />
            <i className="screw bl" />
            <i className="screw br" />
            <h1>Tessitura</h1>
            <p>Pianoforte · Model 61</p>
          </div>

          <Lcd
            last={last}
            count={sounding.length}
            chord={chord}
            voice={voiceLabel}
            range={`${midiName(lowC)}–${midiName(highMidi)}`}
            pedal={pedalOn}
            recording={recording}
            playing={playing !== null}
            analyser={() => engine.analyser}
          />

          <div className="stops-wrap">
            <div className="stops" role="radiogroup" aria-label="Voice">
              {VOICES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={voice === v.id}
                  title={v.sub}
                  className={voice === v.id ? "stop is-in" : "stop"}
                  onClick={() => setVoice(v.id)}
                >
                  <i className="lamp" />
                  <span className="disc">
                    <span>{v.label}</span>
                  </span>
                </button>
              ))}
            </div>
            <span className="engrave">Voice</span>
          </div>

          <div className="knobs">
            <Knob label="Volume" value={volume} onChange={setVolume} initial={0.7} format={pct} />
            <Knob label="Room" value={room} onChange={setRoom} initial={0.3} format={pct} />
            <Knob label="Tone" value={tone} onChange={setTone} initial={0.75} format={pct} />
          </div>
        </div>

        <Book
          held={Array.from(down)}
          ringing={Array.from(sustained)}
          chord={chord}
          recording={recording}
          recSeconds={recSeconds}
          take={take ? { duration: take.duration, notes: take.notes } : null}
          onRec={toggleRec}
          onPlayTake={() => {
            if (!take) return;
            if (playing?.id === "take") stopPlayback();
            else startPlayback("take", take.events, take.duration);
          }}
          onClear={() => {
            if (playing?.id === "take") stopPlayback();
            setTake(null);
          }}
          songs={compiled.map((c) => ({ song: c.song, duration: c.duration }))}
          playing={playing}
          onSong={(id) => {
            if (playing?.id === id) {
              stopPlayback();
              return;
            }
            const c = compiled.find((x) => x.song.id === id);
            if (c) startPlayback(id, c.events, c.duration);
          }}
        />

        <div className="keybed" ref={measure}>
          <Keyboard
            lowC={lowC}
            whites={whites}
            down={down}
            sounding={new Set(sounding)}
            labels={labels}
            onPress={press}
            onRelease={release}
          />
        </div>

        <div className="apron">
          <div className="range">
            <button type="button" className="nudge" onClick={() => shiftRange(-1)} disabled={oct <= 1} aria-label="Range down one octave">
              ◂
            </button>
            <span className="engrave">
              Range <b>{midiName(lowC)}–{midiName(highMidi)}</b>
            </span>
            <button type="button" className="nudge" onClick={() => shiftRange(1)} disabled={oct >= maxOct} aria-label="Range up one octave">
              ▸
            </button>
          </div>

          <button
            type="button"
            className={pedalOn ? "pedal is-down" : "pedal"}
            aria-pressed={pedalOn}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              engine.ensure();
              pedal(true, `ped${e.pointerId}`);
            }}
            onPointerUp={(e) => pedal(false, `ped${e.pointerId}`)}
            onPointerCancel={(e) => pedal(false, `ped${e.pointerId}`)}
            onKeyDown={(e) => e.key === "Enter" && pedal(!pedalSources.current.has("enter"), "enter")}
          >
            <span>Damper</span>
          </button>

          <div className="apron-keys engrave">
            <span>
              Keys <b>Z–M</b> <b>Q–P</b>
            </span>
            <span>
              Pedal <b>Space</b>
            </span>
          </div>
        </div>
      </main>

      <aside className="manual">
        <div>
          <h3>Fingers</h3>
          <p>
            Touch or click the keys. Strike nearer the front edge for a harder blow, and drag across for a glissando.
          </p>
        </div>
        <div>
          <h3>Keyboard</h3>
          <p>
            Letters play two octaves, <kbd>Space</kbd> holds the damper, <kbd>←</kbd> <kbd>→</kbd> move the range.
            Hold <kbd>Shift</kbd> to play louder.
          </p>
        </div>
        <div>
          <h3>Panel</h3>
          <p>
            Drag a knob up or down, scroll over it, or use the arrow keys. Double-click returns it to where it started.
          </p>
        </div>
      </aside>
    </div>
  );
}
