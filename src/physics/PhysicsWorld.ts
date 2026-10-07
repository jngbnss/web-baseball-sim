import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config';

export type Rapier = typeof RAPIER_NS;

/**
 * Owns the Rapier world. Rapier (WASM, ~2 MB) is imported dynamically so the
 * page and loading screen appear before the physics engine has downloaded.
 */
export class PhysicsWorld {
  readonly world: RAPIER_NS.World;

  private constructor(
    readonly R: Rapier,
  ) {
    this.world = new R.World({ x: 0, y: CONFIG.physics.gravity, z: 0 });
    this.world.timestep = CONFIG.physics.fixedDt;
  }

  static async create(): Promise<PhysicsWorld> {
    const mod = await import('@dimforge/rapier3d-compat');
    const R = (mod.default ?? mod) as Rapier;
    await R.init();
    return new PhysicsWorld(R);
  }

  step(): void {
    this.world.step();
  }

  /** Static box collider (ground, fence segments, ...). */
  addStaticBox(
    half: { x: number; y: number; z: number },
    pos: { x: number; y: number; z: number },
    rotY = 0,
    material: { restitution: number; friction: number } = { restitution: 0.4, friction: 0.7 },
  ): void {
    const desc = this.R.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) })
      .setRestitution(material.restitution)
      .setFriction(material.friction);
    this.world.createCollider(desc);
  }
}
