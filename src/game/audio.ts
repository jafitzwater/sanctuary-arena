import type { Sim } from './types';

/**
 * Original cues and a slow ambient bed, synthesized in the browser.
 * Nothing is fetched from the network and nothing is sampled from Diablo II.
 */
let boundBus: AudioBus | null = null;

/** First gesture resumes the context. Each listener is once; a later touch can retry if the click could not start audio. */
export function armGestureAudio(): void {
  const go = () => {
    try {
      boundBus?.unlock();
    } catch {
      /* no audio device */
    }
  };
  window.addEventListener('pointerdown', go, { once: true, capture: true });
  window.addEventListener('touchstart', go, { once: true, capture: true });
}

export function registerAudioBus(bus: AudioBus): void {
  boundBus = bus;
}

export class AudioBus {
  private ctx: AudioContext | null = null;
  muted = false;
  private musicGain: GainNode | null = null;
  private started = false;
  private nextAt = 0;
  private step = 0;
  private noise: AudioBuffer | null = null;
  private readonly melody = [110, 130.81, 146.83, 164.81, 146.83, 130.81, 123.47, 98];

  constructor() {
    try {
      this.muted = localStorage.getItem('sanctuary-arena-mute') === '1';
    } catch {
      this.muted = false;
    }
  }

  unlock(): void {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!this.ctx) this.ctx = new Ctx();
      const ctx = this.ctx;
      const done = () => {
        try {
          if (ctx.state === 'running') this.ensureMusic();
          this.applyMute();
        } catch {
          /* oscillator start can fail when the device has no audio */
        }
        (globalThis as { __audioState?: string }).__audioState = ctx.state;
      };
      let pending: Promise<void> | undefined;
      try {
        pending = ctx.resume();
      } catch {
        done();
        return;
      }
      if (pending && typeof pending.then === 'function') {
        void pending.then(done, () => {
          (globalThis as { __audioState?: string }).__audioState = ctx.state;
        });
      } else done();
    } catch {
      /* AudioContext construction failed */
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('sanctuary-arena-mute', this.muted ? '1' : '0');
    } catch {
      /* private mode */
    }
    this.applyMute();
    return this.muted;
  }

  consume(sim: Sim): void {
    for (const name of sim.sfx) this.haptic(name);
    if (!this.ctx || this.ctx.state !== 'running') {
      sim.sfx.length = 0;
      return;
    }
    try {
      this.pumpMusic();
    } catch {
      /* music voice failed */
    }
    if (this.muted) {
      sim.sfx.length = 0;
      return;
    }
    for (const name of sim.sfx) this.play(name);
    sim.sfx.length = 0;
  }

  private haptic(name: string): void {
    if (name !== 'heavy' && name !== 'whirl') return;
    try {
      if ('vibrate' in navigator) navigator.vibrate(25);
    } catch {
      /* iOS Safari ignores vibrate */
    }
  }

  private applyMute(): void {
    if (!this.ctx || !this.musicGain) return;
    const target = this.muted ? 0 : 0.07;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  private ensureMusic(): void {
    const ctx = this.ctx;
    if (!ctx || this.started || ctx.state !== 'running') return;
    try {
      this.startBed(ctx);
      this.started = true;
    } catch {
      this.started = false;
      this.musicGain = null;
    }
  }

  private startBed(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.musicGain = master;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.Q.value = 0.7;
    filter.connect(master);

    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 55;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.35;
    drone.connect(droneGain);
    droneGain.connect(filter);
    drone.start();

    const fifth = ctx.createOscillator();
    fifth.type = 'triangle';
    fifth.frequency.value = 82.5;
    const fifthGain = ctx.createGain();
    fifthGain.gain.value = 0.12;
    fifth.connect(fifthGain);
    fifthGain.connect(filter);
    fifth.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.nextAt = ctx.currentTime + 0.4;
  }

  private pumpMusic(): void {
    const ctx = this.ctx;
    const master = this.musicGain;
    if (!ctx || !master || this.muted) return;
    while (this.nextAt < ctx.currentTime + 2.4) {
      this.pluck(this.melody[this.step % this.melody.length], this.nextAt, master);
      this.step += 1;
      this.nextAt += this.step % 4 === 0 ? 2.1 : 1.55;
    }
  }

  private pluck(freq: number, when: number, dest: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(0.22, when + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 1.35);
    osc.connect(amp);
    amp.connect(dest);
    osc.start(when);
    osc.stop(when + 1.4);
  }

  private burst(freq: number, when: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const buf = this.noiseBuffer(ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.6;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }

  private play(name: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.voice(name, ctx);
    } catch {
      /* a voice failed to start */
    }
  }

  private voice(name: string, ctx: AudioContext): void {
    const now = ctx.currentTime;
    const tone = (freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + delay);
      amp.gain.setValueAtTime(gain, now + delay);
      amp.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.02);
    };
    switch (name) {
      case 'swing':
        this.burst(180, now, 0.09, 0.12);
        tone(90, 0.08, 'triangle', 0.04);
        break;
      case 'hurt':
        this.burst(240, now, 0.12, 0.08);
        tone(80, 0.14, 'sawtooth', 0.03);
        break;
      case 'bash':
        this.burst(120, now, 0.16, 0.16);
        tone(70, 0.18, 'square', 0.04);
        break;
      case 'leap':
        tone(196, 0.1, 'sine', 0.04);
        tone(392, 0.16, 'sine', 0.03, 0.08);
        break;
      case 'cry':
        tone(140, 0.28, 'sawtooth', 0.035);
        tone(210, 0.24, 'triangle', 0.03, 0.06);
        break;
      case 'whirl':
        this.burst(320, now, 0.2, 0.08);
        tone(180, 0.18, 'square', 0.03);
        break;
      case 'coin':
        tone(660, 0.08, 'square', 0.03);
        tone(880, 0.1, 'square', 0.025, 0.07);
        break;
      case 'potion':
        tone(520, 0.1, 'sine', 0.045);
        tone(780, 0.12, 'sine', 0.03, 0.06);
        break;
      case 'level':
        tone(523, 0.1, 'triangle', 0.045);
        tone(659, 0.12, 'triangle', 0.045, 0.08);
        tone(784, 0.18, 'triangle', 0.045, 0.16);
        break;
      case 'death':
        tone(98, 0.4, 'sawtooth', 0.05);
        this.burst(90, now, 0.3, 0.08);
        break;
      case 'tower':
        tone(60, 0.32, 'square', 0.05);
        this.burst(100, now, 0.28, 0.1);
        break;
      case 'win':
        tone(392, 0.14, 'triangle', 0.05);
        tone(523, 0.16, 'triangle', 0.05, 0.12);
        tone(659, 0.3, 'triangle', 0.05, 0.24);
        break;
      case 'lose':
        tone(196, 0.22, 'sine', 0.05);
        tone(146, 0.32, 'sine', 0.05, 0.16);
        break;
      default:
        break;
    }
  }
}
