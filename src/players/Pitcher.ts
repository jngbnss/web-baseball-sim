import * as THREE from 'three';
import { CONFIG } from '../config';
import { PrimitiveFigure } from './PrimitiveFigure';

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Primitive right-handed pitcher with a keyframe-free windup animation. */
export class Pitcher {
  readonly figure = new PrimitiveFigure({ jersey: 0x2b3f73, pants: 0xe6e6e6, cap: 0x1b2747 });
  private baseZ = CONFIG.field.moundZ + 0.15;

  constructor(scene: THREE.Scene) {
    this.figure.root.position.set(0, 0.25, this.baseZ);
    scene.add(this.figure.root);
    this.pose(0, 0);
  }

  /**
   * @param windup 0..1 progress of the windup (release at 1)
   * @param follow 0..1 progress of the follow-through after release
   */
  pose(windup: number, follow: number): void {
    const f = this.figure;
    const w = smooth(clamp01(windup));
    const kick = Math.sin(Math.PI * clamp01(windup * 1.25)); // leg kick early in the windup
    const stride = smooth(clamp01((windup - 0.55) / 0.45));
    const fol = smooth(clamp01(follow));

    // Throwing (right) arm: back and up during the windup, whips over the top on release.
    f.rightArm.rotation.set(w * 2.7 + fol * 2.6, 0, -0.3 * w);
    f.leftArm.rotation.set(-0.9 * kick - 0.6 * fol, 0, 0.4 * kick);
    f.leftLeg.rotation.x = -1.1 * kick + -0.5 * stride * (1 - fol);
    f.body.rotation.x = 0.25 * fol + 0.1 * stride;
    f.body.rotation.y = -0.5 * kick * (1 - stride);
    f.root.position.z = this.baseZ + 0.7 * stride + 0.15 * fol;
  }
}
