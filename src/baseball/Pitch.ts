import { Vector3 } from 'three';
import { backspinAxis, RPM_TO_RADS } from '../physics/BaseballPhysics';

export type PitchTypeId = 'fastball' | 'curveball' | 'slider' | 'changeup';

/**
 * Data-only pitch definition. Adding a pitch = adding an entry here.
 *
 * Spin is described the way pitch-tracking systems do:
 *  - `rpm`   total spin rate
 *  - `tiltDeg` rotation of the spin axis around the direction of travel.
 *      0 = pure backspin (rise), 180 = pure topspin (drop),
 *     +90 = break toward the pitcher's arm side, -90 = glove side (for a RHP).
 *  - `gyro`  fraction of spin aligned with travel (produces no Magnus break).
 */
export interface PitchType {
  id: PitchTypeId;
  name: string;
  speedKmh: [min: number, max: number];
  rpm: number;
  tiltDeg: number;
  gyro: number;
}

export const PITCH_CATALOG: Record<PitchTypeId, PitchType> = {
  fastball: { id: 'fastball', name: 'Four-Seam Fastball', speedKmh: [138, 150], rpm: 2300, tiltDeg: 30, gyro: 0.1 },
  curveball: { id: 'curveball', name: 'Curveball', speedKmh: [115, 125], rpm: 2600, tiltDeg: -150, gyro: 0.15 },
  slider: { id: 'slider', name: 'Slider', speedKmh: [125, 135], rpm: 2400, tiltDeg: -105, gyro: 0.55 },
  changeup: { id: 'changeup', name: 'Changeup', speedKmh: [125, 133], rpm: 1700, tiltDeg: 55, gyro: 0.1 },
};

/** Spin vector (rad/s) for a pitch travelling along `direction`. */
export function pitchSpinVector(type: PitchType, direction: Vector3): Vector3 {
  const d = direction.clone().normalize();
  const axis = backspinAxis(d).applyAxisAngle(d, (type.tiltDeg * Math.PI) / 180);
  const w = type.rpm * RPM_TO_RADS;
  return axis.multiplyScalar(w * (1 - type.gyro)).addScaledVector(d, w * type.gyro);
}

/** A concrete, solved pitch ready to be thrown. */
export interface PitchPlan {
  type: PitchType;
  speed: number; // m/s at release
  release: Vector3;
  velocity: Vector3;
  spin: Vector3;
  /** Intended location at the front of home plate. */
  target: Vector3;
  isStrikeTarget: boolean;
  /** Seconds from release until the ball crosses the ideal contact plane. */
  timeToContact: number;
  /** Predicted ball center at the ideal contact plane. */
  contactPoint: Vector3;
}
