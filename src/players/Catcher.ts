import * as THREE from 'three';
import { CONFIG } from '../config';
import { PrimitiveFigure } from './PrimitiveFigure';

/** Crouched catcher whose mitt drifts toward the predicted pitch location. */
export class Catcher {
  readonly figure = new PrimitiveFigure({ jersey: 0x2b3f73, pants: 0x9aa3ad, cap: 0x1b2747 });
  readonly mitt: THREE.Mesh;
  private mittTarget = new THREE.Vector3(0, 0.75, CONFIG.catcher.catchZ);

  constructor(scene: THREE.Scene) {
    const f = this.figure;
    f.root.position.set(0, 0, CONFIG.catcher.z);
    f.root.rotation.y = Math.PI; // face the pitcher
    f.body.position.y = -0.82;
    f.leftLeg.position.y -= 0.5;
    f.rightLeg.position.y -= 0.5;
    f.leftLeg.rotation.set(-1.45, 0, 0.35);
    f.rightLeg.rotation.set(-1.45, 0, -0.35);
    scene.add(f.root);

    this.mitt = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a3417, roughness: 0.8 }),
    );
    this.mitt.scale.set(1, 1, 0.55);
    this.mitt.castShadow = true;
    this.mitt.position.copy(this.mittTarget);
    scene.add(this.mitt);
  }

  setTarget(x: number, y: number): void {
    this.mittTarget.set(x, y, CONFIG.catcher.catchZ + 0.08);
  }

  update(dt: number): void {
    this.mitt.position.lerp(this.mittTarget, 1 - Math.exp(-10 * dt));
    this.figure.aimArm(this.figure.leftArm, this.mitt.position);
  }
}
