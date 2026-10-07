import { Vector3 } from 'three';
import { CONFIG } from '../config';
import { simulateToPlaneZ, solvePitchVelocity } from '../physics/BaseballPhysics';
import { PITCH_CATALOG, pitchSpinVector, type PitchPlan, type PitchTypeId } from './Pitch';

export type Rng = () => number;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Chooses and solves pitches. This is the seam for a future pitcher AI:
 * replace `choosePitch` / `chooseTarget` with smarter selection (count, batter
 * tendencies, PvP input) without touching physics or the game loop.
 */
export class PitchManager {
  private enabled: PitchTypeId[];

  constructor(
    enabled: PitchTypeId[] = ['fastball'],
    private rng: Rng = Math.random,
  ) {
    this.enabled = enabled.length ? enabled : ['fastball'];
  }

  get enabledPitches(): readonly PitchTypeId[] {
    return this.enabled;
  }

  plan(): PitchPlan {
    const type = PITCH_CATALOG[this.choosePitch()];
    const speed = lerp(type.speedKmh[0], type.speedKmh[1], this.rng()) / 3.6;
    const { target, isStrikeTarget } = this.chooseTarget();
    const r = CONFIG.pitcher.release;
    const release = new Vector3(r.x, r.y, r.z);

    const dir = new Vector3().subVectors(target, release).normalize();
    const spin = pitchSpinVector(type, dir);
    const velocity = solvePitchVelocity(release, target, speed, spin);

    const contact = simulateToPlaneZ(release, velocity, spin, CONFIG.bat.pivotZ);
    return {
      type,
      speed,
      release,
      velocity,
      spin,
      target,
      isStrikeTarget,
      timeToContact: contact?.time ?? 0.45,
      contactPoint: contact?.position ?? target.clone(),
    };
  }

  private choosePitch(): PitchTypeId {
    return this.enabled[Math.floor(this.rng() * this.enabled.length)];
  }

  private chooseTarget(): { target: Vector3; isStrikeTarget: boolean } {
    const zone = CONFIG.strikeZone;
    const isStrikeTarget = this.rng() < CONFIG.pitcher.strikeRate;
    let x: number;
    let y: number;
    if (isStrikeTarget) {
      x = lerp(-zone.halfWidth * 0.8, zone.halfWidth * 0.8, this.rng());
      y = lerp(zone.bottom + 0.06, zone.top - 0.06, this.rng());
    } else {
      // Just off the edge: tempting, but a ball if taken.
      const side = Math.floor(this.rng() * 4);
      const m = 0.08 + this.rng() * 0.12;
      x = lerp(-zone.halfWidth, zone.halfWidth, this.rng());
      y = lerp(zone.bottom, zone.top, this.rng());
      if (side === 0) x = -zone.halfWidth - m;
      else if (side === 1) x = zone.halfWidth + m;
      else if (side === 2) y = zone.bottom - m;
      else y = zone.top + m;
    }
    return { target: new Vector3(x, y, 0), isStrikeTarget };
  }
}
