import { CONFIG } from '../config';
import type { PerfSnapshot } from '../performance/PerformanceMonitor';
import type { SessionStats } from '../gameplay/Telemetry';
import { TIMING_LABEL, type TimingJudgment } from '../gameplay/TimingJudge';

export type CalloutKind = 'good' | 'great' | 'bad' | 'neutral';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function stat(parent: HTMLElement, label: string): HTMLElement {
  const row = el('div', 'stat');
  row.append(el('div', 'stat-label', label));
  const v = el('div', 'stat-value', '—');
  row.append(v);
  parent.append(row);
  return v;
}

/**
 * DOM overlay. Writes only on change (and perf at 4 Hz) to keep layout cost off
 * the frame budget. Pure view: the game pushes data in, nothing is read back.
 */
export class HUD {
  readonly root = el('div', 'hud');
  private phase = el('div', 'phase', 'READY');
  private pitchInfo = el('div', 'pitch-info', '');
  private ev: HTMLElement;
  private la: HTMLElement;
  private dist: HTMLElement;
  private pitchSpeed: HTMLElement;
  private timing: HTMLElement;
  private callout = el('div', 'callout');
  private subCallout = el('div', 'sub-callout');
  private meterMarker = el('div', 'meter-marker');
  private meter = el('div', 'meter');
  private perf = el('pre', 'perf');
  private session = el('pre', 'session');
  private muted = el('div', 'muted', '🔇 muted (M)');
  private lastPerf = 0;
  private cache = new Map<HTMLElement, string>();

  constructor(parent: HTMLElement) {
    const tl = el('div', 'panel top-left');
    tl.append(this.phase, this.pitchInfo);

    const tr = el('div', 'panel top-right');
    this.pitchSpeed = stat(tr, 'PITCH SPEED');
    this.timing = stat(tr, 'SWING TIMING');
    this.ev = stat(tr, 'EXIT VELOCITY');
    this.la = stat(tr, 'LAUNCH ANGLE');
    this.dist = stat(tr, 'DISTANCE');

    const center = el('div', 'center');
    center.append(this.callout, this.subCallout);

    // Timing meter: center = perfect; marker shows where the swing landed.
    const range = CONFIG.timing.meterRange;
    const zone = (cls: string, half: number) => {
      const z = el('div', `meter-zone ${cls}`);
      const w = (half / range) * 50;
      z.style.left = `${50 - w}%`;
      z.style.width = `${2 * w}%`;
      return z;
    };
    this.meter.append(
      zone('good', CONFIG.timing.good),
      zone('perfect', CONFIG.timing.perfect),
      el('div', 'meter-label left', 'EARLY'),
      el('div', 'meter-label right', 'LATE'),
      this.meterMarker,
    );
    const meterWrap = el('div', 'meter-wrap');
    meterWrap.append(this.meter);

    const help = el('div', 'help');
    help.innerHTML = '<b>SPACE</b> / tap: swing &nbsp; <b>R</b>: new pitch &nbsp; <b>M</b>: mute &nbsp; <b>C</b>: show bat collider';

    const bl = el('div', 'panel bottom-left');
    bl.append(this.perf);
    const br = el('div', 'panel bottom-right');
    br.append(this.session);

    this.muted.hidden = true;
    this.root.append(tl, tr, center, meterWrap, help, bl, br, this.muted);
    parent.append(this.root);
    this.clearTiming();
  }

  private set(e: HTMLElement, text: string): void {
    if (this.cache.get(e) === text) return;
    this.cache.set(e, text);
    e.textContent = text;
  }

  setPhase(label: string): void {
    this.set(this.phase, label);
    this.phase.dataset.phase = label;
  }

  setPitch(name: string, kmh: number | null): void {
    this.set(this.pitchInfo, name);
    this.set(this.pitchSpeed, kmh === null ? '—' : `${kmh.toFixed(0)} km/h`);
  }

  setTiming(judgment: TimingJudgment | null, deltaMs: number | null): void {
    if (judgment === null || deltaMs === null) {
      this.set(this.timing, '—');
      return;
    }
    const sign = deltaMs > 0 ? '+' : '';
    this.set(this.timing, `${TIMING_LABEL[judgment]} (${sign}${deltaMs.toFixed(0)} ms)`);
    const range = CONFIG.timing.meterRange * 1000;
    const x = Math.max(-1, Math.min(1, deltaMs / range));
    this.meterMarker.style.left = `${50 + x * 50}%`;
    this.meterMarker.dataset.judgment = judgment;
    this.meter.classList.add('active');
  }

  clearTiming(): void {
    this.meter.classList.remove('active');
  }

  setHit(evKmh: number | null, launchDeg: number | null, distM: number | null, estimated = false): void {
    this.set(this.ev, evKmh === null ? '—' : `${evKmh.toFixed(0)} km/h`);
    this.set(this.la, launchDeg === null ? '—' : `${launchDeg.toFixed(0)}°`);
    this.set(this.dist, distM === null ? '—' : `${distM.toFixed(0)} m${estimated ? ' (est.)' : ''}`);
  }

  showCallout(text: string, kind: CalloutKind, sub = ''): void {
    this.callout.textContent = text;
    this.callout.dataset.kind = kind;
    this.subCallout.textContent = sub;
    // Restart the pop animation.
    this.callout.classList.remove('pop');
    void this.callout.offsetWidth;
    this.callout.classList.add('pop');
  }

  hideCallout(): void {
    this.callout.classList.remove('pop');
    this.callout.textContent = '';
    this.subCallout.textContent = '';
  }

  setMuted(m: boolean): void {
    this.muted.hidden = !m;
  }

  /** Perf panel refreshes at 4 Hz; check first so the snapshot isn't built every frame. */
  perfDue(now = performance.now()): boolean {
    return now - this.lastPerf >= 250;
  }

  updatePerf(s: PerfSnapshot, now = performance.now()): void {
    this.lastPerf = now;
    const sec = s.sections;
    const f = (n: number | undefined) => (n === undefined ? '-' : n.toFixed(2));
    this.perf.textContent =
      `FPS         ${s.fps.toFixed(0)}\n` +
      `Frame       ${s.frameMs.toFixed(2)} ms (p95 ${s.frameP95Ms.toFixed(1)})\n` +
      `Rapier step ${f(sec.physics)} ms ×${s.physicsSteps}\n` +
      `Sim step    ${f(sec.sim)} ms\n` +
      `Render CPU  ${f(sec.render)} ms\n` +
      `Draw Calls  ${s.drawCalls}\n` +
      `Triangles   ${s.triangles.toLocaleString()}\n` +
      `Geo / Tex   ${s.geometries} / ${s.textures}` +
      (s.heapMB !== null ? `\nJS Heap     ${s.heapMB.toFixed(1)} MB` : '');
  }

  updateSession(s: SessionStats): void {
    const pct = s.swings ? Math.round((s.contacts / s.swings) * 100) : 0;
    this.session.textContent =
      `SESSION\n` +
      `Pitches     ${s.pitches}\n` +
      `Contact     ${s.contacts}/${s.swings} (${pct}%)\n` +
      `Perfect     ${s.perfects}\n` +
      `Home Runs   ${s.homeRuns}\n` +
      `Best EV     ${s.bestExitVelocityKmh ? s.bestExitVelocityKmh.toFixed(0) + ' km/h' : '—'}\n` +
      `Longest     ${s.longestDistanceM ? s.longestDistanceM.toFixed(0) + ' m' : '—'}\n` +
      `Avg timing  ${s.avgTimingErrorMs === null ? '—' : '±' + s.avgTimingErrorMs.toFixed(0) + ' ms'}`;
  }
}
