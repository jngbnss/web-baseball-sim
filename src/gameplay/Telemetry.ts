import type { PlayRecord } from './HitResult';

export interface SessionStats {
  pitches: number;
  swings: number;
  contacts: number;
  perfects: number;
  homeRuns: number;
  bestExitVelocityKmh: number;
  longestDistanceM: number;
  /** Mean |timing error| over swings, ms. */
  avgTimingErrorMs: number | null;
}

/**
 * Per-pitch log for the playtest loop: what do players actually do, and is the
 * timing window / tuning right? Exposed as `window.wbs.telemetry` for export.
 */
export class Telemetry {
  readonly records: PlayRecord[] = [];

  add(r: PlayRecord): void {
    this.records.push(r);
  }

  stats(): SessionStats {
    const rs = this.records;
    const swings = rs.filter((r) => r.swung);
    const timed = swings.filter((r) => r.timingMs !== null);
    return {
      pitches: rs.length,
      swings: swings.length,
      contacts: rs.filter((r) => r.contact).length,
      perfects: rs.filter((r) => r.judgment === 'PERFECT' && r.contact).length,
      homeRuns: rs.filter((r) => r.outcome === 'HOME_RUN').length,
      bestExitVelocityKmh: Math.max(0, ...rs.map((r) => r.exitVelocityKmh ?? 0)),
      longestDistanceM: Math.max(0, ...rs.filter((r) => r.outcome !== 'FOUL').map((r) => r.distanceM ?? 0)),
      avgTimingErrorMs: timed.length ? timed.reduce((s, r) => s + Math.abs(r.timingMs!), 0) / timed.length : null,
    };
  }

  toJSON(): string {
    return JSON.stringify({ stats: this.stats(), records: this.records }, null, 2);
  }

  download(): void {
    const blob = new Blob([this.toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wbs-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
