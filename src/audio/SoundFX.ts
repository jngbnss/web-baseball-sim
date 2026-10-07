/**
 * Tiny synthesized sound effects (no audio files). The AudioContext is created on
 * the first user gesture, as browsers require.
 */
export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }

  private burst(opts: { duration: number; gain: number; type: BiquadFilterType; freq: number; q?: number; attack?: number }): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise || this.muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type;
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + opts.duration);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + a + opts.duration + 0.05);
  }

  private tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine'): void {
    const { ctx, master } = this;
    if (!ctx || !master || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  /** Bat crack; `quality` 0..1 makes it sharper and louder. */
  crack(quality: number): void {
    this.burst({ duration: 0.06 + 0.1 * quality, gain: 0.5 + 0.5 * quality, type: 'bandpass', freq: 1800 + 1600 * quality, q: 0.9 });
    this.tone(900 + 500 * quality, 0.05, 0.35 * quality, 'triangle');
  }

  whoosh(): void {
    this.burst({ duration: 0.16, gain: 0.18, type: 'bandpass', freq: 700, q: 0.7, attack: 0.05 });
  }

  mitt(): void {
    this.burst({ duration: 0.07, gain: 0.55, type: 'lowpass', freq: 600, q: 0.5 });
    this.tone(140, 0.08, 0.4);
  }

  cheer(intensity = 1): void {
    this.burst({ duration: 2.4, gain: 0.25 * intensity, type: 'bandpass', freq: 1100, q: 0.4, attack: 0.35 });
  }
}
