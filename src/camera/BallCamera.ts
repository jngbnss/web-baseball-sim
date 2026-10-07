import * as THREE from 'three';
import { CONFIG } from '../config';
import { fenceDistance, sprayAngleDeg } from '../world/FieldDimensions';
import type { CameraRig } from './CameraRig';

/**
 * Chase camera for batted balls: sits behind the ball along its (smoothed)
 * horizontal heading, looking at it. Lag from smoothing sells the ball's speed.
 * The camera always stays on the home-plate side of the ball and inside the wall,
 * so rebounds off the fence don't swing it into the stands.
 */
export class BallCamera implements CameraRig {
  positionRate: number = CONFIG.camera.smoothing;
  targetRate = 14;
  private heading = new THREE.Vector3(0, 0, -1);
  private desired = new THREE.Vector3();
  private outward = new THREE.Vector3();

  constructor(
    private ball: { position: THREE.Vector3; velocity: THREE.Vector3 },
  ) {}

  activate(): void {
    this.heading.set(this.ball.velocity.x, 0, this.ball.velocity.z);
    if (this.heading.lengthSq() < 1e-4) this.heading.set(0, 0, -1);
    this.heading.normalize();
  }

  update(dt: number, position: THREE.Vector3, target: THREE.Vector3): void {
    const b = this.ball;
    this.outward.set(b.position.x, 0, b.position.z);
    const r = this.outward.length();
    if (r > 1) this.outward.divideScalar(r);
    else this.outward.copy(this.heading);

    // Follow the flight direction while the ball moves away from home; otherwise
    // (rebounds, slow rollers) look outward from home plate.
    this.desired.set(b.velocity.x, 0, b.velocity.z);
    const speed = this.desired.length();
    if (speed > 3 && this.desired.dot(this.outward) > 0) this.desired.divideScalar(speed);
    else this.desired.copy(this.outward);
    this.heading.lerp(this.desired, 1 - Math.exp(-2 * dt)).normalize();

    // Ball resting up in the seats (home run): pull back to a wide shot.
    const inSeats = speed < 0.1 && b.position.y > 2;
    const dist = CONFIG.camera.followDistance + (inSeats ? 30 : 0);
    position.copy(b.position).addScaledVector(this.heading, -dist);
    position.y = Math.max(2, b.position.y * 0.6 + CONFIG.camera.followHeight + (inSeats ? 6 : 0));

    // Keep the camera inside the outfield wall.
    const pr = Math.hypot(position.x, position.z);
    const limit = fenceDistance(sprayAngleDeg(position.x, position.z)) - 4;
    if (position.z < 0 && pr > limit) {
      position.x *= limit / pr;
      position.z *= limit / pr;
    }
    target.copy(b.position);
  }
}
