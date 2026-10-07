import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CONFIG } from '../src/config';
import { PitchManager } from '../src/baseball/PitchManager';
import { PITCH_CATALOG, pitchSpinVector, type PitchTypeId } from '../src/baseball/Pitch';
import {
  estimateLanding,
  horizontalDistance,
  simulateFlight,
  simulateToPlaneZ,
  solvePitchVelocity,
  stepFlight,
} from '../src/physics/BaseballPhysics';
import { aimSwing, computeBattedBall, sweepBatBall, swingStateAt, SWING_DURATION, type Swing } from '../src/batter/BatPhysics';
import { judgeTiming } from '../src/gameplay/TimingJudge';
import { fenceDistance, isFair, sprayAngleDeg } from '../src/world/FieldDimensions';
import { GameStateMachine, Phase } from '../src/core/GameState';

/** Deterministic RNG so tests are stable. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const release = () => new Vector3(CONFIG.pitcher.release.x, CONFIG.pitcher.release.y, CONFIG.pitcher.release.z);

describe('pitch solver', () => {
  for (const id of Object.keys(PITCH_CATALOG) as PitchTypeId[]) {
    it(`${id} reaches its target within 2 cm`, () => {
      const target = new Vector3(0.1, 0.8, 0);
      const r = release();
      const spin = pitchSpinVector(PITCH_CATALOG[id], target.clone().sub(r));
      const v = solvePitchVelocity(r, target, 38, spin);
      const hit = simulateToPlaneZ(r, v, spin, 0)!;
      expect(hit.position.distanceTo(target)).toBeLessThan(0.02);
    });
  }

  it('slider breaks glove side (+X) and changeup arm side (-X) relative to a spinless ball', () => {
    const r = release();
    const v = new Vector3(0.4, 1.2, 36);
    const zero = simulateToPlaneZ(r, v, new Vector3(), 0)!.position.x;
    const dir = v.clone().normalize();
    const slider = simulateToPlaneZ(r, v, pitchSpinVector(PITCH_CATALOG.slider, dir), 0)!.position.x;
    const change = simulateToPlaneZ(r, v, pitchSpinVector(PITCH_CATALOG.changeup, dir), 0)!.position.x;
    expect(slider).toBeGreaterThan(zero);
    expect(change).toBeLessThan(zero);
  });
});

describe('timing judge', () => {
  it('classifies deltas', () => {
    expect(judgeTiming(0)).toBe('PERFECT');
    expect(judgeTiming(-0.025)).toBe('EARLY');
    expect(judgeTiming(0.025)).toBe('LATE');
    expect(judgeTiming(-0.08)).toBe('TOO_EARLY');
    expect(judgeTiming(0.08)).toBe('TOO_LATE');
  });
});

/**
 * Headless version of the core loop: throw a solved pitch, start a swing with a
 * given timing error, step the ball, sweep the bat, compute the batted ball.
 */
function playPitch(timingError: number, seed = 3) {
  const pm = new PitchManager(['fastball'], seeded(seed));
  let plan = pm.plan();
  while (!plan.isStrikeTarget) plan = pm.plan();

  const swing: Swing = {
    startTime: plan.timeToContact - CONFIG.swing.timeToContact + timingError,
    ...aimSwing(plan.contactPoint, () => 0.5),
  };
  const s = { position: plan.release.clone(), velocity: plan.velocity.clone(), spin: plan.spin.clone(), time: 0 };
  const prev = new Vector3();
  const dt = CONFIG.physics.fixedDt;
  while (s.time < 1.2 && s.position.z < 1) {
    prev.copy(s.position);
    const t0 = s.time;
    stepFlight(s, dt);
    const contact = sweepBatBall(swing, prev, s.position, t0, s.time);
    if (contact) {
      const ball = computeBattedBall(contact, s.velocity.length(), timingError);
      return { plan, contact, ball };
    }
  }
  return { plan, contact: null, ball: null };
}

describe('core loop: pitch -> swing -> contact -> batted ball', () => {
  it('a perfectly timed swing makes contact and hits it hard into fair territory', () => {
    const { contact, ball } = playPitch(0);
    expect(contact).not.toBeNull();
    expect(ball!.judgment).toBe('PERFECT');
    expect(ball!.exitSpeed * 3.6).toBeGreaterThan(130);
    expect(Math.abs(ball!.sprayDeg)).toBeLessThan(20);
    const landing = estimateLanding(contact!.ballPosition, ball!.velocity, ball!.spin);
    expect(horizontalDistance(landing.position)).toBeGreaterThan(40);
  });

  it('early contact is pulled (3B side), late contact goes the other way', () => {
    const early = playPitch(-0.03);
    const late = playPitch(0.03);
    expect(early.ball).not.toBeNull();
    expect(late.ball).not.toBeNull();
    expect(early.ball!.sprayDeg).toBeLessThan(-5);
    expect(late.ball!.sprayDeg).toBeGreaterThan(5);
    expect(early.ball!.exitSpeed).toBeLessThan(playPitch(0).ball!.exitSpeed);
  });

  it('a swing far too early misses', () => {
    expect(playPitch(-0.25).contact).toBeNull();
  });

  it('timing window allows contact for at least ±35 ms', () => {
    for (const e of [-0.035, -0.02, 0.02, 0.035]) expect(playPitch(e).contact, `error ${e}`).not.toBeNull();
  });
});

describe('field', () => {
  it('fence is deepest in center', () => {
    expect(fenceDistance(0)).toBeCloseTo(CONFIG.field.fenceCenter);
    expect(fenceDistance(45)).toBeCloseTo(CONFIG.field.fenceFoulLine);
  });
  it('fair/foul', () => {
    expect(isFair(0, -50)).toBe(true);
    expect(isFair(40, -20)).toBe(false);
    expect(isFair(0, 5)).toBe(false);
    expect(sprayAngleDeg(10, -10)).toBeCloseTo(45);
  });
});

describe('game state machine', () => {
  it('follows the pitch flow and rejects illegal transitions', () => {
    const sm = new GameStateMachine();
    expect(sm.transition(Phase.CONTACT, 0)).toBe(false);
    expect(sm.transition(Phase.PITCHING, 0)).toBe(true);
    expect(sm.transition(Phase.BALL_IN_FLIGHT, 1)).toBe(true);
    expect(sm.transition(Phase.SWING, 1.2)).toBe(true);
    expect(sm.transition(Phase.CONTACT, 1.3)).toBe(true);
    expect(sm.transition(Phase.RESULT, 3)).toBe(true);
    expect(sm.transition(Phase.READY, 5)).toBe(true);
  });
});

describe('aero sanity', () => {
  it('a 160 km/h, 28° drive with backspin carries 100–140 m', () => {
    const v = new Vector3(0, Math.sin(0.4887), -Math.cos(0.4887)).multiplyScalar(160 / 3.6);
    const spin = new Vector3(2100 * 0.1047, 0, 0); // backspin for -Z travel is +X axis
    const s = simulateFlight(new Vector3(0, 1, 0), v, spin, { stop: (st) => st.position.y <= 0 });
    const d = horizontalDistance(s.position);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(140);
  });
});

describe('swing lifecycle', () => {
  it('a swing is live on the very step it starts (regression: was cleared as idle at elapsed = 0)', () => {
    expect(swingStateAt(0).phase).toBe('swing');
    expect(swingStateAt(-0.001).phase).toBe('idle');
    expect(swingStateAt(SWING_DURATION + 0.01).phase).toBe('idle');
  });
});
