import type * as THREE from 'three';
import { CONFIG } from '../config';
import type { CameraRig } from './CameraRig';

/** Behind-the-plate batting view (MLB The Show style): plate, zone and mound in frame. */
export class BattingCamera implements CameraRig {
  positionRate: number = CONFIG.camera.returnSmoothing;
  targetRate: number = CONFIG.camera.returnSmoothing * 1.5;

  update(_dt: number, position: THREE.Vector3, target: THREE.Vector3): void {
    const c = CONFIG.camera.batting;
    position.set(c.x, c.y, c.z);
    target.set(c.lookX, c.lookY, c.lookZ);
  }
}
