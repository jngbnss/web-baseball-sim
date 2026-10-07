import * as THREE from 'three';

export interface FigureColors {
  jersey: number;
  pants: number;
  cap: number;
  skin?: number;
}

/**
 * Minimal humanoid from capsules/spheres, facing +Z. Placeholder until GLB
 * player models exist; exposes limb pivots so simple animation code can drive it.
 */
export class PrimitiveFigure {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly leftArm = new THREE.Group();
  readonly rightArm = new THREE.Group();
  readonly leftLeg = new THREE.Group();
  readonly rightLeg = new THREE.Group();

  constructor(colors: FigureColors) {
    const jersey = new THREE.MeshStandardMaterial({ color: colors.jersey, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: colors.pants, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: colors.skin ?? 0xd9a27a, roughness: 0.7 });
    const cap = new THREE.MeshStandardMaterial({ color: colors.cap, roughness: 0.6 });

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, y = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.y = y;
      o.castShadow = true;
      return o;
    };

    this.root.add(this.body);
    this.body.add(mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), jersey, 1.25));
    this.body.add(mesh(new THREE.SphereGeometry(0.12, 14, 10), skin, 1.66));
    const capTop = mesh(new THREE.SphereGeometry(0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, 1.69);
    const brim = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 14), cap, 1.69);
    brim.position.z = 0.1;
    this.body.add(capTop, brim);

    for (const [arm, x] of [
      [this.leftArm, 0.25],
      [this.rightArm, -0.25],
    ] as const) {
      arm.position.set(x, 1.45, 0);
      const a = mesh(new THREE.CapsuleGeometry(0.055, 0.5, 4, 8), jersey, -0.3);
      const hand = mesh(new THREE.SphereGeometry(0.05, 8, 6), skin, -0.6);
      arm.add(a, hand);
      this.body.add(arm);
    }
    for (const [leg, x] of [
      [this.leftLeg, 0.11],
      [this.rightLeg, -0.11],
    ] as const) {
      leg.position.set(x, 0.92, 0);
      leg.add(mesh(new THREE.CapsuleGeometry(0.08, 0.7, 4, 8), pants, -0.45));
      this.root.add(leg);
    }
  }

  /** Point an arm (its -Y axis) at a world-space target, e.g. the bat handle. */
  aimArm(arm: THREE.Group, worldTarget: THREE.Vector3): void {
    const shoulder = arm.getWorldPosition(_s);
    _d.subVectors(worldTarget, shoulder).normalize();
    // Into the arm parent's space.
    arm.parent!.getWorldQuaternion(_pq).invert();
    _d.applyQuaternion(_pq);
    arm.quaternion.setFromUnitVectors(DOWN, _d);
  }
}

const DOWN = new THREE.Vector3(0, -1, 0);
const _s = new THREE.Vector3();
const _d = new THREE.Vector3();
const _pq = new THREE.Quaternion();
