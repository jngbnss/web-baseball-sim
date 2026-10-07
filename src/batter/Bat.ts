import * as THREE from 'three';
import { CONFIG } from '../config';
import type { BatPose } from './BatPhysics';

const B = CONFIG.bat;
const FORWARD = new THREE.Vector3(0, 0, 1);
const KNOB_BACK = 0.07;

/**
 * Visual bat. Its transform is driven by `batPoseAt` (BatPhysics) — the same pose
 * used for collision — so it is purely a view. The local +Z axis runs from the hands
 * to the barrel end, with the origin at the hands (swing pivot).
 */
export class Bat {
  readonly mesh = new THREE.Group();
  /** Debug capsule showing the real collision volume (toggle with `C`). */
  readonly collider: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const wood = new THREE.MeshStandardMaterial({ color: 0xd8b07a, roughness: 0.45 });
    const len = B.length + KNOB_BACK;
    const geo = new THREE.CylinderGeometry(B.barrelRadius, B.handleRadius, len, 16, 1)
      .rotateX(Math.PI / 2)
      .translate(0, 0, len / 2 - KNOB_BACK);
    const bat = new THREE.Mesh(geo, wood);
    bat.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(B.barrelRadius, 12, 8), wood);
    cap.position.z = B.length;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12).rotateX(Math.PI / 2), wood);
    knob.position.z = -KNOB_BACK;
    this.mesh.add(bat, cap, knob);

    const colLen = B.length - B.handleStart;
    this.collider = new THREE.Mesh(
      new THREE.CapsuleGeometry(B.collisionRadius, colLen, 4, 12).rotateX(Math.PI / 2).translate(0, 0, B.handleStart + colLen / 2),
      new THREE.MeshBasicMaterial({ color: 0x33ff88, wireframe: true, transparent: true, opacity: 0.35 }),
    );
    this.collider.visible = false;
    this.mesh.add(this.collider);
    scene.add(this.mesh);
  }

  setPose(pose: BatPose): void {
    this.mesh.position.copy(pose.pivot);
    this.mesh.quaternion.setFromUnitVectors(FORWARD, pose.dir);
  }
}
