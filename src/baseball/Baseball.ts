import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { CONFIG } from '../config';
import { aeroAcceleration } from '../physics/BaseballPhysics';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

const R_BALL = CONFIG.ball.radius;
const _acc = new THREE.Vector3();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * The baseball: a Rapier dynamic rigid body (gravity, collisions, bounce, CCD)
 * plus aerodynamic forces from `BaseballPhysics`, and its visual (mesh + trail).
 */
export class Baseball {
  readonly mesh: THREE.Group;
  readonly body: RAPIER_NS.RigidBody;
  /** Spin in rad/s (world space). Kept outside Rapier: it only drives Magnus. */
  readonly spin = new THREE.Vector3();
  readonly position = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  active = false;

  private trail: THREE.Line;
  private trailPositions: Float32Array;
  private trailCount = 0;

  constructor(
    scene: THREE.Scene,
    private physics: PhysicsWorld,
  ) {
    const { R, world } = physics;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setCcdEnabled(true).setLinearDamping(0).setAngularDamping(0.8).setEnabled(false),
    );
    world.createCollider(
      R.ColliderDesc.ball(R_BALL)
        .setMass(CONFIG.ball.mass)
        .setRestitution(CONFIG.ball.restitution)
        .setFriction(CONFIG.ball.friction),
      this.body,
    );

    this.mesh = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(R_BALL, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xf7f5ee, roughness: 0.55 }),
    );
    ball.castShadow = true;
    // Red seam ring makes spin visible.
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(R_BALL * 0.99, R_BALL * 0.09, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xc8202a }),
    );
    seam.rotation.x = Math.PI / 2.6;
    this.mesh.add(ball, seam);
    this.mesh.visible = false;
    scene.add(this.mesh);

    const n = CONFIG.ball.trailLength;
    this.trailPositions = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
  }

  launch(position: THREE.Vector3, velocity: THREE.Vector3, spin: THREE.Vector3): void {
    this.body.setEnabled(true);
    this.body.setTranslation(position, true);
    this.body.setLinvel(velocity, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.spin.copy(spin);
    this.position.copy(position);
    this.prevPosition.copy(position);
    this.velocity.copy(velocity);
    this.active = true;
    this.mesh.visible = true;
    this.clearTrail();
  }

  /** Replace the velocity mid-flight (bat contact). */
  redirect(position: THREE.Vector3, velocity: THREE.Vector3, spin: THREE.Vector3): void {
    this.body.setTranslation(position, true);
    this.body.setLinvel(velocity, true);
    this.spin.copy(spin);
    this.position.copy(position);
    this.prevPosition.copy(position);
    this.velocity.copy(velocity);
  }

  /** Stop simulating and pin the ball in place (caught / out of play). */
  freeze(at?: THREE.Vector3): void {
    if (at) this.position.copy(at);
    this.prevPosition.copy(this.position);
    this.velocity.set(0, 0, 0);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    this.body.setEnabled(false);
    this.active = false;
  }

  hide(): void {
    this.freeze();
    this.mesh.visible = false;
    this.clearTrail();
  }

  get onGround(): boolean {
    return this.position.y <= R_BALL + 0.01;
  }

  /** Call before `world.step()`: aero forces + rolling resistance. */
  prePhysics(dt: number): void {
    if (!this.active) return;
    const lv = this.body.linvel();
    _v.set(lv.x, lv.y, lv.z);
    if (this.onGround) {
      this.spin.set(0, 0, 0);
      _v.multiplyScalar(Math.max(0, 1 - 1.4 * dt)); // grass rolling resistance
    } else {
      aeroAcceleration(_v, this.spin, _acc);
      _v.addScaledVector(_acc, dt);
      this.spin.multiplyScalar(1 - CONFIG.ball.spinDecay * dt);
    }
    this.body.setLinvel(_v, true);
    this.prevPosition.copy(this.position);
  }

  /** Call after `world.step()`. */
  postPhysics(): void {
    if (!this.active) return;
    const t = this.body.translation();
    const lv = this.body.linvel();
    this.position.set(t.x, t.y, t.z);
    this.velocity.set(lv.x, lv.y, lv.z);
  }

  /** Visual update with fixed-step interpolation. */
  render(alpha: number, dt: number): void {
    if (!this.mesh.visible) return;
    if (this.active) this.mesh.position.lerpVectors(this.prevPosition, this.position, alpha);
    else this.mesh.position.copy(this.position);

    const w = this.spin.length();
    if (w > 0) {
      // Visual spin is slowed down ~10x; real rates alias at 60 fps.
      _q.setFromAxisAngle(_axis.copy(this.spin).divideScalar(w), w * dt * 0.1);
      this.mesh.quaternion.premultiply(_q);
    }
    if (this.active) this.pushTrail(this.mesh.position);
  }

  private clearTrail(): void {
    this.trailCount = 0;
    this.trail.geometry.setDrawRange(0, 0);
  }

  private pushTrail(p: THREE.Vector3): void {
    const a = this.trailPositions;
    const n = CONFIG.ball.trailLength;
    if (this.trailCount < n) this.trailCount++;
    a.copyWithin(3, 0, (n - 1) * 3);
    a[0] = p.x;
    a[1] = p.y;
    a[2] = p.z;
    const geo = this.trail.geometry;
    geo.setDrawRange(0, this.trailCount);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.physics.world.removeRigidBody(this.body);
  }
}
