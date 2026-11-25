/* A small Web Audio instrument. No samples: every voice is synthesised.
 *
 *   voices ─► bus ─► tone (low-pass) ─┬─► dry ───────────┐
 *                                      └─► room ─► wet ──┴─► master ─► compressor ─► out
 */

import { clamp, midiFreq } from "./music";

export type VoiceId = "upright" | "felt" | "tine" | "celesta";

export const VOICES: { id: VoiceId; label: string; sub: string }[] = [
  { id: "upright", label: "Upright", sub: "bright, hammered" },
  { id: "felt", label: "Felt", sub: "soft, muffled" },
  { id: "tine", label: "Tine", sub: "electric, FM" },
  { id: "celesta", label: "Celesta", sub: "glassy bars" },
];

interface Live {
  release(now: number): void;
  kill(now: number): void;
}

interface PianoProfile {
  name: string;
  rolloff: number; // harmonic amplitude ~ 1 / n^rolloff
  maxH: number;
  hammerPos: number; // fraction of the string struck → nulls certain harmonics
  cutHi: number; // initial filter cutoff in multiples of f0
  cutLo: number; // settled filter cutoff
  cutTau: number;
  attack: number;
  detune: number; // cents between the two "strings"
  thump: number; // hammer noise level
  thumpHz: number; // multiple of f0
  tauScale: number;
  fast: number; // level after the quick first decay
}

const UPRIGHT: PianoProfile = {
  name: "upright",
  rolloff: 1.0,
  maxH: 30,
  hammerPos: 1 / 8,
  cutHi: 16,
  cutLo: 3.4,
  cutTau: 0.45,
  attack: 0.003,
  detune: 2.4,
  thump: 0.55,
  thumpHz: 2.6,
  tauScale: 1,
  fast: 0.42,
};

const FELT: PianoProfile = {
  name: "felt",
  rolloff: 2.2,
  maxH: 10,
  hammerPos: 1 / 6.5,
  cutHi: 5.5,
  cutLo: 1.9,
  cutTau: 0.7,
  attack: 0.011,
  detune: 1.5,
  thump: 0.3,
  thumpHz: 1.4,
  tauScale: 1.3,
  fast: 0.55,
};

const MAX_VOICES = 30;

export class PianoEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;

  private bus!: GainNode;
  private tone!: BiquadFilterNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private master!: GainNode;
  private noise!: AudioBuffer;

  private live = new Map<number, Live>();
  private waves = new Map<string, PeriodicWave>();

  private voice: VoiceId = "upright";
  private volume = 0.7;
  private room = 0.3;
  private toneAmt = 0.75;

  /** Must be first called from a user gesture (pointer / key). */
  ensure(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive" });
    this.ctx = ctx;

    this.bus = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.Q.value = 0.4;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.master = ctx.createGain();

    const verb = ctx.createConvolver();
    verb.buffer = this.makeImpulse(ctx, 2.8, 3.1);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    this.bus.connect(this.tone);
    this.tone.connect(this.dry);
    this.tone.connect(verb);
    verb.connect(this.wet);
    this.dry.connect(this.master);
    this.wet.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    comp.connect(this.analyser);

    // 0.25 s of noise for hammer thumps
    const len = Math.floor(ctx.sampleRate * 0.25);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.applyParams();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  /* ---------- controls ---------- */

  setVoice(v: VoiceId) {
    this.voice = v;
  }
  setVolume(v: number) {
    this.volume = v;
    this.applyParams();
  }
  setRoom(v: number) {
    this.room = v;
    this.applyParams();
  }
  setTone(v: number) {
    this.toneAmt = v;
    this.applyParams();
  }

  private applyParams() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(0.95 * this.volume * this.volume, t, 0.02);
    this.wet.gain.setTargetAtTime(this.room * 0.95, t, 0.05);
    this.dry.gain.setTargetAtTime(1 - this.room * 0.3, t, 0.05);
    const cutoff = clamp(420 * Math.pow(2, this.toneAmt * 5.6), 300, ctx.sampleRate / 2 - 500);
    this.tone.frequency.setTargetAtTime(cutoff, t, 0.03);
  }

  /* ---------- notes ---------- */

  noteOn(midi: number, vel: number) {
    const ctx = this.ensure();
    const t = ctx.currentTime + 0.004;

    const prev = this.live.get(midi);
    if (prev) {
      prev.kill(t);
      this.live.delete(midi);
    }
    while (this.live.size >= MAX_VOICES) {
      const oldest = this.live.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.live.get(oldest)?.kill(t);
      this.live.delete(oldest);
    }

    let v: Live;
    switch (this.voice) {
      case "felt":
        v = this.piano(ctx, midi, vel, t, FELT);
        break;
      case "tine":
        v = this.tine(ctx, midi, vel, t);
        break;
      case "celesta":
        v = this.celesta(ctx, midi, vel, t);
        break;
      default:
        v = this.piano(ctx, midi, vel, t, UPRIGHT);
    }
    this.live.set(midi, v);
  }

  noteOff(midi: number) {
    const ctx = this.ctx;
    const v = this.live.get(midi);
    if (!ctx || !v) return;
    this.live.delete(midi);
    v.release(ctx.currentTime);
  }

  allOff() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.live.values()) v.release(ctx.currentTime);
    this.live.clear();
  }

  /* ---------- voice builders ---------- */

  private pitchTrim(midi: number) {
    return clamp(1.12 - (midi - 48) * 0.0055, 0.62, 1.25);
  }

  private tauFor(midi: number, scale = 1) {
    return clamp(scale * 3.1 * Math.pow(2, -(midi - 30) / 24), 0.32, 4.4);
  }

  private pianoWave(ctx: AudioContext, p: PianoProfile, midi: number) {
    const id = `${p.name}:${midi}`;
    const cached = this.waves.get(id);
    if (cached) return cached;

    const f = midiFreq(midi);
    const N = Math.max(3, Math.min(p.maxH, Math.floor(10000 / f)));
    const real = new Float32Array(N + 1);
    const imag = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) {
      let a = 1 / Math.pow(n, p.rolloff);
      a *= Math.abs(Math.sin(Math.PI * n * p.hammerPos)) * 0.85 + 0.15;
      if (midi < 50) {
        if (n === 1) a *= 0.55; // small cabinets never had a bass fundamental
        if (n >= 2 && n <= 5) a *= 1.35;
      }
      imag[n] = a;
    }
    const wave = ctx.createPeriodicWave(real, imag);
    this.waves.set(id, wave);
    return wave;
  }

  private shape(
    ctx: AudioContext,
    amp: GainNode,
    oscs: (OscillatorNode | AudioBufferSourceNode)[],
    relTau: number,
    cleanup: AudioNode[],
  ): Live {
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      for (const n of cleanup) {
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      }
    };
    oscs[0].onended = finish;

    const fade = (now: number, tau: number) => {
      const g = amp.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.setTargetAtTime(0, now, tau);
      const end = now + tau * 9 + 0.05;
      for (const o of oscs) {
        try {
          o.stop(end);
        } catch {
          /* stop() already scheduled */
        }
      }
    };

    return {
      release: (now) => fade(Math.max(now, ctx.currentTime), relTau),
      kill: (now) => fade(Math.max(now, ctx.currentTime), 0.012),
    };
  }

  private piano(ctx: AudioContext, midi: number, vel: number, t: number, p: PianoProfile): Live {
    const f = midiFreq(midi);
    const wave = this.pianoWave(ctx, p, midi);

    const amp = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 0.5;
    const hi = Math.min(f * p.cutHi * (0.55 + vel * 0.9), 16000);
    const lo = Math.min(f * p.cutLo, 9000);
    filt.frequency.setValueAtTime(hi, t);
    filt.frequency.setTargetAtTime(lo, t + 0.01, p.cutTau);

    const peak = 0.27 * (0.16 + 0.84 * Math.pow(vel, 1.5)) * this.pitchTrim(midi);
    const slow = this.tauFor(midi, p.tauScale);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + p.attack);
    amp.gain.setTargetAtTime(peak * p.fast, t + p.attack, 0.15);
    amp.gain.setTargetAtTime(0, t + 0.5, slow);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.setPeriodicWave(wave);
    o2.setPeriodicWave(wave);
    o1.frequency.value = f;
    o2.frequency.value = f;
    o1.detune.value = -p.detune;
    o2.detune.value = p.detune;
    o1.connect(filt);
    o2.connect(filt);
    filt.connect(amp);
    amp.connect(this.bus);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 18);
    o2.stop(t + 18);

    // the knock of the hammer
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = clamp(f * p.thumpHz, 220, 5200);
    bp.Q.value = 0.75;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(p.thump * (0.1 + 0.9 * vel) * 0.5, t);
    tg.gain.setTargetAtTime(0, t, 0.011);
    src.connect(bp);
    bp.connect(tg);
    tg.connect(this.bus);
    src.start(t);
    src.stop(t + 0.14);

    const rel = clamp(0.15 - (midi - 24) * 0.0010, 0.055, 0.15);
    return this.shape(ctx, amp, [o1, o2], rel, [o1, o2, filt, amp, bp, tg]);
  }

  private tine(ctx: AudioContext, midi: number, vel: number, t: number): Live {
    const f = midiFreq(midi);
    const amp = ctx.createGain();

    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    car.type = "sine";
    mod.type = "sine";
    car.frequency.value = f;
    mod.frequency.value = f;

    const brightness = clamp(1.25 - midi / 110, 0.35, 1.2);
    const idx0 = f * (0.7 + 2.6 * vel) * brightness;
    modGain.gain.setValueAtTime(idx0, t);
    modGain.gain.setTargetAtTime(f * 0.22, t, 0.28);
    mod.connect(modGain);
    modGain.connect(car.frequency);

    const peak = 0.3 * (0.2 + 0.8 * Math.pow(vel, 1.3)) * this.pitchTrim(midi);
    const slow = this.tauFor(midi, 0.95);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.0025);
    amp.gain.setTargetAtTime(peak * 0.6, t + 0.0025, 0.2);
    amp.gain.setTargetAtTime(0, t + 0.6, slow);

    car.connect(amp);
    amp.connect(this.bus);

    const all: (OscillatorNode | AudioBufferSourceNode)[] = [car, mod];
    const extra: AudioNode[] = [car, mod, modGain, amp];

    // tine overtone, a quick glassy ping
    if (f * 7.05 < 9000) {
      const bell = ctx.createOscillator();
      const bg = ctx.createGain();
      bell.type = "sine";
      bell.frequency.value = f * 7.05;
      bg.gain.setValueAtTime(0.14 * vel * peak * 4, t);
      bg.gain.setTargetAtTime(0, t, 0.05);
      bell.connect(bg);
      bg.connect(this.bus);
      bell.start(t);
      bell.stop(t + 18);
      all.push(bell);
      extra.push(bell, bg);
    }

    car.start(t);
    mod.start(t);
    car.stop(t + 18);
    mod.stop(t + 18);

    return this.shape(ctx, amp, all, clamp(0.2 - (midi - 24) * 0.0012, 0.07, 0.2), extra);
  }

  private celesta(ctx: AudioContext, midi: number, vel: number, t: number): Live {
    const f = midiFreq(midi);
    const amp = ctx.createGain();
    amp.connect(this.bus);

    const peak = 0.3 * (0.2 + 0.8 * Math.pow(vel, 1.2)) * this.pitchTrim(midi);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.0012);

    const partials: [number, number, number][] = [
      [1, 1, clamp(1.9 * Math.pow(2, -(midi - 60) / 30), 0.35, 3.4)],
      [4.01, 0.42, 0.26],
      [9.8, 0.12, 0.07],
    ];

    const oscs: OscillatorNode[] = [];
    const extra: AudioNode[] = [amp];
    for (const [ratio, level, tau] of partials) {
      if (f * ratio > 11000) continue;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * ratio;
      g.gain.setValueAtTime(level, t);
      g.gain.setTargetAtTime(0, t + 0.002, tau * (ratio === 1 ? 0.5 : 1));
      o.connect(g);
      g.connect(amp);
      o.start(t);
      o.stop(t + 14);
      oscs.push(o);
      extra.push(o, g);
    }
    // the fundamental has the long tail; shape the whole bell through amp too
    amp.gain.setTargetAtTime(peak * 0.5, t + 0.002, 0.3);
    amp.gain.setTargetAtTime(0, t + 0.9, this.tauFor(midi + 8, 0.55));

    return this.shape(ctx, amp, oscs, 0.09, extra);
  }

  /* ---------- room ---------- */

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const pre = Math.floor(rate * 0.014);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre);
        const n = (Math.random() * 2 - 1) * Math.pow(1 - x, decay);
        // the tail gets darker as it fades, like a real room
        const k = 0.62 - 0.5 * x;
        lp += (n - lp) * k;
        d[i] = lp;
      }
    }
    return buf;
  }
}
