import { CONFIG } from '../config';

const F = CONFIG.field;
const DEG = Math.PI / 180;

/** Spray angle in degrees: 0 = straight to center field, + = first-base side. */
export function sprayAngleDeg(x: number, z: number): number {
  return Math.atan2(x, -z) / DEG;
}

/** Fence distance from home plate for a spray angle (smooth foul line -> center). */
export function fenceDistance(sprayDeg: number): number {
  const a = Math.min(Math.abs(sprayDeg), F.foulAngleDeg);
  return F.fenceFoulLine + (F.fenceCenter - F.fenceFoulLine) * Math.cos(a * 2 * DEG);
}

export function isFair(x: number, z: number): boolean {
  return z < 0 && Math.abs(sprayAngleDeg(x, z)) <= F.foulAngleDeg;
}

const D = F.baseDistance;
const H = D / Math.SQRT2;
export const BASES = {
  home: { x: 0, z: 0 },
  first: { x: H, z: -H },
  second: { x: 0, z: -2 * H },
  third: { x: -H, z: -H },
} as const;

/** Outfield stands: a slope starting just behind the wall. */
export const STANDS = { gap: 1.5, depth: 42, topY: 26 } as const;

/** Height of the stands surface at distance `r` (fair territory), or -Infinity in front of them. */
export function standsSurfaceY(sprayDeg: number, r: number): number {
  const start = fenceDistance(sprayDeg) + STANDS.gap;
  if (r < start) return -Infinity;
  const y0 = F.fenceHeight + 0.5;
  return y0 + ((Math.min(r, start + STANDS.depth) - start) / STANDS.depth) * (STANDS.topY - y0);
}
