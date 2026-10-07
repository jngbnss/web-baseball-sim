import * as THREE from 'three';

/** A rig proposes where the camera wants to be; the director smooths between rigs. */
export interface CameraRig {
  /** Write the desired camera position / look-at target. */
  update(dt: number, position: THREE.Vector3, target: THREE.Vector3): void;
  /** Smoothing rate (1/s) used while this rig is active. */
  readonly positionRate: number;
  readonly targetRate: number;
  /** Called when the rig becomes active. */
  activate?(): void;
}

/**
 * Owns the THREE camera. Exponential smoothing (frame-rate independent) means
 * switching rigs never snaps; additive shake is layered on top.
 */
export class CameraDirector {
  private rig: CameraRig;
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private desiredPos = new THREE.Vector3();
  private desiredTarget = new THREE.Vector3();
  private shake = 0;
  private time = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    initial: CameraRig,
  ) {
    this.rig = initial;
    initial.update(0, this.pos, this.target);
    camera.position.copy(this.pos);
    camera.lookAt(this.target);
  }

  setRig(rig: CameraRig): void {
    if (rig === this.rig) return;
    this.rig = rig;
    rig.activate?.();
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  update(dt: number): void {
    this.time += dt;
    this.rig.update(dt, this.desiredPos, this.desiredTarget);
    this.pos.lerp(this.desiredPos, 1 - Math.exp(-this.rig.positionRate * dt));
    this.target.lerp(this.desiredTarget, 1 - Math.exp(-this.rig.targetRate * dt));

    this.camera.position.copy(this.pos);
    if (this.shake > 1e-4) {
      const t = this.time * 60;
      this.camera.position.x += Math.sin(t * 1.7) * this.shake;
      this.camera.position.y += Math.sin(t * 2.3 + 1) * this.shake;
      this.shake *= Math.exp(-9 * dt);
    }
    this.camera.lookAt(this.target);
  }
}
