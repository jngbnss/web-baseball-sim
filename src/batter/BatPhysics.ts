import { Vector3 } from 'three';
import { CONFIG } from '../config';
import { backspinAxis, RPM_TO_RADS } from '../physics/BaseballPhysics';
import { judgeTiming, timingFactor, type TimingJudgment } from '../gameplay/TimingJudge';

/**
 * Pure swing kinematics + bat/ball contact model.
 *
 * The bat yaw angle θ (around +Y) is 0 when the barrel points at the catcher (+Z)
 * and PI/2 when it lies across the plate (+X), which is the ideal contact pose.
 * The same `batPoseAt` function drives both the visual bat and the collision
 * test, so what you see is what you hit.
 */

const S = CONFIG.swing;
const B = CONFIG.bat;
const DEG = Math.PI / 180;

const SWING_RANGE = S.contactAngle - S.startAngle;
/** Angular velocity (rad/s) at the ideal contact angle. */
export const CONTACT_OMEGA = (2 * SWING_RANGE) / S.timeToContact;
const FOLLOW_RANGE = S.endAngle - S.contactAngle;
const FOLLOW_DECEL = (CONTACT_OMEGA * CONTACT_OMEGA) / (2 * FOLLOW_RANGE);
const FOLLOW_TIME = CONTACT_OMEGA / FOLLOW_DECEL;

export type SwingPhase = 'idle' | 'swing' | 'follow' | 'hold' | 'recover';

export interface SwingState {
  phase: SwingPhase;
  theta: number;
  omega: number;
  /** 0..1 progress of the recovery back to stance (only in 'recover'). */
  recover: number;
}

export const SWING_DURATION = S.timeToContact + FOLLOW_TIME + S.followHold + S.recoverTime;

export function swingStateAt(elapsed: number, out: SwingState = { phase: 'idle', theta: 0, omega: 0, recover: 0 }): SwingState {
  out.recover = 0;
  if (elapsed < 0 || elapsed >= SWING_DURATION) {
    out.phase = 'idle';
    out.theta = S.startAngle;
    out.omega = 0;
    return out;
  }
  if (elapsed <= S.timeToContact) {
    const k = elapsed / S.timeToContact;
    out.phase = 'swing';
    out.theta = S.startAngle + SWING_RANGE * k * k;
    out.omega = CONTACT_OMEGA * k;
    return out;
  }
  const tau = elapsed - S.timeToContact;
  if (tau <= FOLLOW_TIME) {
    out.phase = 'follow';
    out.theta = S.contactAngle + CONTACT_OMEGA * tau - 0.5 * FOLLOW_DECEL * tau * tau;
    out.omega = CONTACT_OMEGA - FOLLOW_DECEL * tau;
    return out;
  }
  out.theta = S.endAngle;
  out.omega = 0;
  const h = tau - FOLLOW_TIME;
  if (h <= S.followHold) {
    out.phase = 'hold';
    return out;
  }
  out.phase = 'recover';
  out.recover = Math.min(1, (h - S.followHold) / S.recoverTime);
  return out;
}

export function isBatLive(s: SwingState): boolean {
  return s.phase === 'swing' || s.phase === 'follow';
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface BatPose {
  pivot: Vector3;
  /** Unit vector from the hands toward the barrel end. */
  dir: Vector3;
}

function poseForAngle(theta: number, geo: SwingGeometry, out: BatPose): BatPose {
  // Barrel elevation: up in the stance, level through the hitting zone, up in follow-through.
  let elev: number;
  let handsBlend: number;
  if (theta < S.contactAngle) {
    const w = 1 - smoothstep(S.startAngle, 45 * DEG, theta);
    elev = 62 * DEG * w;
    handsBlend = w;
  } else {
    const w = smoothstep(140 * DEG, 260 * DEG, theta);
    elev = 50 * DEG * w;
    handsBlend = w;
  }
  const planeY = geo.planeHeight + S.planeSlope * (theta - S.contactAngle);
  const y = planeY + (S.stanceHandsHeight - planeY) * handsBlend;
  out.pivot.set(geo.pivotX, y, B.pivotZ);
  const c = Math.cos(elev);
  out.dir.set(Math.sin(theta) * c, Math.sin(elev), Math.cos(theta) * c);
  return out;
}

const _stance: BatPose = { pivot: new Vector3(), dir: new Vector3() };

export function batPoseAt(state: SwingState, geo: SwingGeometry, out: BatPose = { pivot: new Vector3(), dir: new Vector3() }): BatPose {
  if (state.phase === 'idle') return poseForAngle(S.startAngle, geo, out);
  poseForAngle(state.theta, geo, out);
  if (state.phase === 'recover') {
    poseForAngle(S.startAngle, geo, _stance);
    const k = smoothstep(0, 1, state.recover);
    out.pivot.lerp(_stance.pivot, k);
    out.dir.lerp(_stance.dir, k).normalize();
  }
  return out;
}

/** Where the batter places the swing: plane height and hands distance from the plate. */
export interface SwingGeometry {
  planeHeight: number;
  pivotX: number;
}

export interface Swing extends SwingGeometry {
  startTime: number;
}

export const STANCE_GEOMETRY: SwingGeometry = { planeHeight: S.practicePlaneHeight, pivotX: B.pivotX };

export interface BatContact {
  time: number;
  ballPosition: Vector3;
  /** Distance from the hands along the bat. */
  r: number;
  theta: number;
  omega: number;
  /** Ball center height minus bat axis height at the contact point (+ = bat under ball). */
  verticalOffset: number;
}

const _state: SwingState = { phase: 'idle', theta: 0, omega: 0, recover: 0 };
const _pose: BatPose = { pivot: new Vector3(), dir: new Vector3() };
const _ball = new Vector3();
const _a = new Vector3();
const _closest = new Vector3();

/**
 * Swept bat-vs-ball test over one physics step. The bat tip moves ~25 m/s and the
 * ball ~40 m/s, so a discrete overlap check would tunnel; instead both are sampled
 * along the step and tested as sphere vs. capsule.
 */
export function sweepBatBall(
  swing: Swing,
  ballFrom: Vector3,
  ballTo: Vector3,
  tFrom: number,
  tTo: number,
  samples = 10,
): BatContact | null {
  const hitDist = CONFIG.ball.radius + B.collisionRadius;
  for (let i = 1; i <= samples; i++) {
    const s = i / samples;
    const time = tFrom + (tTo - tFrom) * s;
    swingStateAt(time - swing.startTime, _state);
    if (!isBatLive(_state)) continue;
    batPoseAt(_state, swing, _pose);
    _ball.lerpVectors(ballFrom, ballTo, s);

    _a.subVectors(_ball, _pose.pivot);
    const r = Math.min(B.length, Math.max(B.handleStart, _a.dot(_pose.dir)));
    _closest.copy(_pose.pivot).addScaledVector(_pose.dir, r);
    if (_closest.distanceTo(_ball) <= hitDist) {
      return {
        time,
        ballPosition: _ball.clone(),
        r,
        theta: _state.theta,
        omega: _state.omega,
        verticalOffset: _ball.y - _closest.y,
      };
    }
  }
  return null;
}

export interface BattedBall {
  velocity: Vector3;
  spin: Vector3;
  exitSpeed: number; // m/s
  launchDeg: number;
  sprayDeg: number; // 0 = center field, + = first-base side
  judgment: TimingJudgment;
  timingDelta: number;
  batSpeed: number;
  sweetFactor: number;
  centerFactor: number;
}

/**
 * Arcade-flavoured batted-ball model, consistent so results are comparable:
 *  - exit speed ~ q * pitchSpeed + (1 + q) * batSpeed (classic collision formula),
 *    scaled by sweet-spot distance, vertical centering and timing quality
 *  - launch angle from where on the bat (above/below the axis) the ball was struck
 *  - spray direction from the bat's swing direction at contact (early = pull)
 */
export function computeBattedBall(contact: BatContact, pitchSpeed: number, timingDelta: number): BattedBall {
  const H = CONFIG.hit;
  const judgment = judgeTiming(timingDelta);

  const batSpeed = H.batSpeed * (contact.omega / CONTACT_OMEGA) * (contact.r / B.sweetSpot);
  const sweet = Math.max(H.minSweetFactor, 1 - ((contact.r - B.sweetSpot) / H.sweetWidth) ** 2);
  const u = Math.max(-1, Math.min(1, contact.verticalOffset / (CONFIG.ball.radius + B.collisionRadius)));
  const center = 1 - H.centerPenalty * u * u;

  const exitSpeed = (H.q * pitchSpeed + (1 + H.q) * batSpeed) * sweet * center * timingFactor(judgment);
  const launchDeg = H.baseLaunchDeg + u * H.launchPerOffsetDeg;
  const sprayDeg = 90 - contact.theta / DEG;

  const la = launchDeg * DEG;
  const sp = sprayDeg * DEG;
  const heading = new Vector3(Math.sin(sp), 0, -Math.cos(sp));
  const velocity = heading
    .clone()
    .multiplyScalar(Math.cos(la) * exitSpeed)
    .setY(Math.sin(la) * exitSpeed);

  const rpm = Math.max(-1800, Math.min(2600, launchDeg * 75));
  const spin = backspinAxis(heading).multiplyScalar(rpm * RPM_TO_RADS);

  return {
    velocity,
    spin,
    exitSpeed,
    launchDeg,
    sprayDeg,
    judgment,
    timingDelta,
    batSpeed,
    sweetFactor: sweet,
    centerFactor: center,
  };
}

/**
 * Arcade auto-aim (the seam for future aim input: mouse, gyro, MediaPipe):
 *  - level the swing plane slightly under the predicted ball path (lift)
 *  - step the hands toward/away from the plate so strikes meet the sweet spot;
 *    pitches off the plate still get jammed or hit off the end.
 */
export function aimSwing(predicted: { x: number; y: number }, rng: () => number = Math.random): SwingGeometry {
  const ideal = predicted.x - B.sweetSpot;
  const pivotX = Math.min(B.pivotX + B.reach, Math.max(B.pivotX - B.reach, ideal));
  return {
    planeHeight: predicted.y - S.aimBelowBall + (rng() * 2 - 1) * S.aimJitter,
    pivotX,
  };
}
