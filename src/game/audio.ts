import type { Sim } from './types';

/** Tiny synthesized cues. Nothing is loaded from the network. */
export class AudioBus {
  private ctx: AudioContext | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('sanctuary-arena-mute') === '1';
    } catch {
      this.muted = false;
    }
  }

  unlock(): void {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) this.ctx = new Ctx();
    void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('sanctuary-arena-mute', this.muted ? '1' : '0');
    } catch {
      /* private mode */
    }
    return this.muted;
  }

  consume(sim: Sim): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') {
      sim.sfx.length = 0;
      return;
    }
    for (const name of sim.sfx) this.play(name);
    sim.sfx.length = 0;
  }

  private play(name: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
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
        tone(140, 0.08, 'triangle', 0.04);
        break;
      case 'hurt':
        tone(90, 0.14, 'sawtooth', 0.035);
        break;
      case 'bash':
        tone(90, 0.16, 'square', 0.05);
        tone(180, 0.1, 'triangle', 0.03, 0.04);
        break;
      case 'leap':
        tone(220, 0.12, 'sine', 0.04);
        tone(440, 0.16, 'sine', 0.03, 0.08);
        break;
      case 'cry':
        tone(160, 0.22, 'sawtooth', 0.04);
        tone(240, 0.2, 'triangle', 0.03, 0.05);
        break;
      case 'whirl':
        tone(200, 0.18, 'square', 0.035);
        break;
      case 'coin':
        tone(660, 0.08, 'square', 0.03);
        tone(880, 0.1, 'square', 0.025, 0.07);
        break;
      case 'potion':
        tone(520, 0.1, 'sine', 0.04);
        break;
      case 'level':
        tone(523, 0.1, 'triangle', 0.04);
        tone(659, 0.12, 'triangle', 0.04, 0.08);
        tone(784, 0.16, 'triangle', 0.04, 0.16);
        break;
      case 'death':
        tone(110, 0.35, 'sawtooth', 0.05);
        break;
      case 'tower':
        tone(70, 0.3, 'square', 0.05);
        break;
      case 'win':
        tone(392, 0.14, 'triangle', 0.05);
        tone(523, 0.16, 'triangle', 0.05, 0.12);
        tone(659, 0.28, 'triangle', 0.05, 0.24);
        break;
      case 'lose':
        tone(196, 0.2, 'sine', 0.05);
        tone(146, 0.3, 'sine', 0.05, 0.16);
        break;
      default:
        break;
    }
  }
}
