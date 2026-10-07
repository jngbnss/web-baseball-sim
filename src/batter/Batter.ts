import * as THREE from 'three';
import { CONFIG } from '../config';
import { PrimitiveFigure } from '../players/PrimitiveFigure';
import { Bat } from './Bat';
import {
  batPoseAt,
  STANCE_GEOMETRY,
  swingStateAt,
  type BatPose,
  type Swing,
  type SwingGeometry,
  type SwingState,
} from './BatPhysics';

/**
 * The batter: owns the current swing and drives the visual figure + bat from the
 * analytic swing pose. Knows nothing about input devices (see BatterController).
 */
export class Batter {
  readonly figure = new PrimitiveFigure({ jersey: 0xf2f2f2, pants: 0xf2f2f2, cap: 0xb22234 });
  readonly bat: Bat;
  readonly state: SwingState = { phase: 'idle', theta: 0, omega: 0, recover: 0 };
  readonly pose: BatPose = { pivot: new THREE.Vector3(), dir: new THREE.Vector3() };
  private swing: Swing | null = null;
  private geometry: SwingGeometry = { ...STANCE_GEOMETRY };
  private handle = new THREE.Vector3();
  // Render-time (interpolated) pose: the sim steps at 120 Hz, displays run at 60-240 Hz.
  private visState: SwingState = { phase: 'idle', theta: 0, omega: 0, recover: 0 };
  private visPose: BatPose = { pivot: new THREE.Vector3(), dir: new THREE.Vector3() };

  constructor(scene: THREE.Scene) {
    this.figure.root.rotation.y = Math.PI / 2; // face the plate (+X)
    scene.add(this.figure.root);
    this.bat = new Bat(scene);
    this.update(0);
  }

  get currentSwing(): Swing | null {
    return this.swing;
  }

  get isSwinging(): boolean {
    return this.state.phase !== 'idle';
  }

  /** Returns the new swing, or null if a swing is already in progress. */
  startSwing(time: number, geometry: SwingGeometry): Swing | null {
    if (this.isSwinging) return null;
    this.swing = { startTime: time, ...geometry };
    this.geometry = geometry;
    return this.swing;
  }

  cancel(): void {
    this.swing = null;
    this.state.phase = 'idle';
    this.geometry = { ...STANCE_GEOMETRY };
  }

  update(time: number): void {
    if (this.swing) {
      swingStateAt(time - this.swing.startTime, this.state);
      if (this.state.phase === 'idle') {
        this.swing = null;
        this.geometry = { ...STANCE_GEOMETRY };
      }
    } else {
      swingStateAt(-1, this.state);
    }
    batPoseAt(this.state, this.geometry, this.pose);
  }

  /** Visual sync at the interpolated render time; same pose function as collision. */
  render(time: number): void {
    swingStateAt(this.swing ? time - this.swing.startTime : -1, this.visState);
    batPoseAt(this.visState, this.geometry, this.visPose);
    this.bat.setPose(this.visPose);
    const f = this.figure;
    f.root.position.set(this.geometry.pivotX - 0.36, 0, CONFIG.bat.pivotZ + 0.12);
    const turn = Math.max(0, this.visState.theta - CONFIG.swing.startAngle);
    f.body.rotation.y = Math.min(1.4, turn * 0.42); // hips/shoulders open toward the pitcher
    f.root.updateMatrixWorld(true);
    this.handle.copy(this.visPose.pivot).addScaledVector(this.visPose.dir, 0.02);
    f.aimArm(f.leftArm, this.handle);
    f.aimArm(f.rightArm, this.handle);
  }
}
