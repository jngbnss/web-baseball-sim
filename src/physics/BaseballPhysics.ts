import { Vector3 } from 'three';
import { CONFIG } from '../config';

/**
 * Pure aerodynamic model for the baseball (no Rapier, no DOM).
 *
 * Rapier integrates gravity and collisions; this module adds drag + Magnus as a
 * velocity change applied before every physics step. The same integrator is used
 * offline (`simulateFlight`) so pitch aiming and distance estimates match what the
 * live simulation does.
 */

const _tmp = new Vector3();

/** Writes drag + Magnus acceleration into `out`. */
export function aeroAcceleration(velocity: Vector3, spin: Vector3, out: Vector3): Vector3 {
  const speed = velocity.length();
  out.copy(velocity).multiplyScalar(-CONFIG.ball.dragK * speed);
  _tmp.crossVectors(spin, velocity).multiplyScalar(CONFIG.ball.magnusK);
  return out.add(_tmp);
}

export interface FlightState {
  position: Vector3;
  velocity: Vector3;
  spin: Vector3;
  time: number;
}

export interface SimulateOptions {
  dt?: number;
  maxTime?: number;
  /** Return true to stop. Called after each step with the new state. */
  stop?: (s: FlightState, prevPosition: Vector3) => boolean;
  onStep?: (s: FlightState) => void;
}

const _acc = new Vector3();
const _prev = new Vector3();

/** Semi-implicit Euler identical in order to the live loop: aero -> gravity -> position. */
export function stepFlight(s: FlightState, dt: number): void {
  aeroAcceleration(s.velocity, s.spin, _acc);
  s.velocity.addScaledVector(_acc, dt);
  s.velocity.y += CONFIG.physics.gravity * dt;
  s.position.addScaledVector(s.velocity, dt);
  s.spin.multiplyScalar(1 - CONFIG.ball.spinDecay * dt);
  s.time += dt;
}

export function simulateFlight(
  position: Vector3,
  velocity: Vector3,
  spin: Vector3,
  opts: SimulateOptions = {},
): FlightState {
  const dt = opts.dt ?? CONFIG.physics.fixedDt;
  const maxTime = opts.maxTime ?? 12;
  const s: FlightState = {
    position: position.clone(),
    velocity: velocity.clone(),
    spin: spin.clone(),
    time: 0,
  };
  while (s.time < maxTime) {
    _prev.copy(s.position);
    stepFlight(s, dt);
    opts.onStep?.(s);
    if (opts.stop?.(s, _prev)) break;
  }
  return s;
}

/** Linear interpolation factor where `a -> b` crosses `value` on one axis. */
export function crossingFraction(a: number, b: number, value: number): number {
  const d = b - a;
  return d === 0 ? 0 : (value - a) / d;
}

export interface PlaneCrossing {
  position: Vector3;
  velocity: Vector3;
  time: number;
}

/** Simulates until the ball crosses the plane z = planeZ (moving toward +Z). */
export function simulateToPlaneZ(
  position: Vector3,
  velocity: Vector3,
  spin: Vector3,
  planeZ: number,
): PlaneCrossing | null {
  let result: PlaneCrossing | null = null;
  const dt = CONFIG.physics.fixedDt;
  simulateFlight(position, velocity, spin, {
    dt,
    maxTime: 3,
    stop: (s, prev) => {
      if (s.position.z < planeZ) return false;
      const f = crossingFraction(prev.z, s.position.z, planeZ);
      result = {
        position: prev.clone().lerp(s.position, f),
        velocity: s.velocity.clone(),
        time: s.time - dt + f * dt,
      };
      return true;
    },
  });
  return result;
}

/**
 * Shooting solver: finds the release velocity (at roughly `speed`) that makes a
 * ball with `spin` cross z = target.z at (target.x, target.y), including gravity,
 * drag and Magnus. Breaking pitches therefore curve *into* the target.
 */
export function solvePitchVelocity(
  release: Vector3,
  target: Vector3,
  speed: number,
  spin: Vector3,
  iterations = 8,
): Vector3 {
  const dist = release.distanceTo(target);
  const t = dist / speed;
  const v = new Vector3().subVectors(target, release).divideScalar(t);
  v.y -= 0.5 * CONFIG.physics.gravity * t;

  for (let i = 0; i < iterations; i++) {
    const hit = simulateToPlaneZ(release, v, spin, target.z);
    if (!hit) break;
    const ex = target.x - hit.position.x;
    const ey = target.y - hit.position.y;
    if (Math.abs(ex) < 1e-4 && Math.abs(ey) < 1e-4) break;
    v.x += ex / hit.time;
    v.y += ey / hit.time;
    // Keep the commanded speed: drag/aim corrections shouldn't change pitch velo.
    v.setLength(speed);
  }
  return v;
}

/** Where a batted ball first touches the ground (ignoring walls). */
export function estimateLanding(position: Vector3, velocity: Vector3, spin: Vector3): FlightState {
  return simulateFlight(position, velocity, spin, {
    maxTime: 15,
    stop: (s) => s.position.y <= CONFIG.ball.radius && s.velocity.y < 0,
  });
}

export function horizontalDistance(p: Vector3): number {
  return Math.hypot(p.x, p.z);
}

/** Backspin axis for a ball travelling along `dir` (Magnus lift points up). */
export function backspinAxis(dir: Vector3, out = new Vector3()): Vector3 {
  out.set(dir.x, 0, dir.z);
  if (out.lengthSq() < 1e-8) out.set(0, 0, -1);
  out.normalize();
  // axis = dir x up  ->  (axis x dir) = up
  return out.set(-out.z, 0, out.x);
}

export const RPM_TO_RADS = (2 * Math.PI) / 60;
export const MS_TO_KMH = 3.6;
