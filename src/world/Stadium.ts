import * as THREE from 'three';
import { CONFIG } from '../config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { BASES, fenceDistance, STANDS } from './FieldDimensions';

const F = CONFIG.field;
const DEG = Math.PI / 180;

/**
 * Anything that can act as a ballpark. The primitive `Stadium` below implements it;
 * a future `GltfStadium` (GLB visuals + the same collider layout from
 * FieldDimensions) can replace it without touching game code.
 */
export interface Ballpark {
  readonly root: THREE.Object3D;
  dispose(): void;
}

/** Point on the field for a spray angle (deg) and distance from home. */
function fieldPoint(sprayDeg: number, dist: number, y = 0): THREE.Vector3 {
  const a = sprayDeg * DEG;
  return new THREE.Vector3(Math.sin(a) * dist, y, -Math.cos(a) * dist);
}

/** Triangle strip between two polylines (same length) -> one mesh / one draw call. */
function ribbon(a: THREE.Vector3[], b: THREE.Vector3[], uScale = 1): THREE.BufferGeometry {
  const n = a.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const idx: number[] = [];
  let u = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) u += a[i].distanceTo(a[i - 1]) * uScale;
    a[i].toArray(pos, i * 6);
    b[i].toArray(pos, i * 6 + 3);
    uv.set([u, 0, u, 1], i * 4);
    if (i < n - 1) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Primitive-geometry ballpark: grass, infield dirt, mound, plate, bases, foul lines,
 * warning track, outfield wall, foul poles and stands. Also creates the physics
 * colliders (ground + wall). No external assets.
 */
export class Stadium implements Ballpark {
  readonly root = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, physics: PhysicsWorld) {
    this.root.name = 'Stadium';
    scene.add(this.root);
    this.buildGround();
    this.buildInfield();
    this.buildLines();
    this.buildOutfieldWall(physics);
    this.buildStands();
    this.buildColliders(physics);
  }

  private add<T extends THREE.Object3D>(o: T, receiveShadow = true): T {
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.receiveShadow = receiveShadow;
        this.disposables.push(c.geometry);
        this.disposables.push(c.material as THREE.Material);
      }
    });
    this.root.add(o);
    return o;
  }

  /** Flat mesh lying on the ground at height y (layers avoid z-fighting). */
  private flat(geo: THREE.BufferGeometry, color: number | THREE.Texture, y: number, x = 0, z = 0): THREE.Mesh {
    geo.rotateX(-Math.PI / 2);
    const mat =
      typeof color === 'number'
        ? new THREE.MeshStandardMaterial({ color, roughness: 1 })
        : new THREE.MeshStandardMaterial({ map: color, roughness: 1 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return this.add(m);
  }

  private buildGround(): void {
    const stripes = canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = '#3f8a3a';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#4a9a43';
      ctx.fillRect(0, 0, 64, 32);
    });
    const grass = new THREE.CircleGeometry(300, 64);
    const uv = grass.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 300 / 8, uv.getY(i) * 300 / 8);
    stripes.repeat.set(1, 1);
    this.flat(grass, stripes, 0);
    this.disposables.push(stripes);
  }

  private buildInfield(): void {
    const DIRT = 0xb57d4e;
    const INFIELD_GRASS = 0x46933f;
    // Infield skin: 90° wedge from home plate.
    this.flat(new THREE.CircleGeometry(29, 48, 45 * DEG, 90 * DEG), DIRT, 0.01);

    const diamond = new THREE.PlaneGeometry(24, 24);
    diamond.rotateZ(45 * DEG);
    this.flat(diamond, INFIELD_GRASS, 0.02, BASES.second.x, BASES.second.z / 2);

    this.flat(new THREE.CircleGeometry(4, 32), DIRT, 0.03);
    for (const b of [BASES.first, BASES.second, BASES.third]) this.flat(new THREE.CircleGeometry(2.6, 24), DIRT, 0.03, b.x, b.z);

    // Mound: low cone frustum + rubber.
    this.flat(new THREE.CircleGeometry(2.74, 32), DIRT, 0.03, 0, F.moundZ);
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 2.74, 0.25, 32),
      new THREE.MeshStandardMaterial({ color: 0xa8714a, roughness: 1 }),
    );
    mound.position.set(0, 0.125, F.moundZ);
    this.add(mound);
    const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.04, 0.15), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    rubber.position.set(0, 0.26, F.moundZ + 0.3);
    this.add(rubber);

    // Home plate (pentagon, point toward the catcher).
    const s = new THREE.Shape();
    s.moveTo(-0.216, 0.216);
    s.lineTo(0.216, 0.216);
    s.lineTo(0.216, 0);
    s.lineTo(0, -0.216);
    s.lineTo(-0.216, 0);
    s.closePath();
    // Shape is drawn in (x, -z) since flat() maps shape Y to world -Z.
    this.flat(new THREE.ShapeGeometry(s), 0xffffff, 0.045);

    for (const b of [BASES.first, BASES.second, BASES.third]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      base.position.set(b.x, 0.04, b.z);
      base.rotation.y = 45 * DEG;
      base.castShadow = true;
      this.add(base);
    }
  }

  private buildLines(): void {
    const white = new THREE.MeshBasicMaterial({ color: 0xf4f4f0 });
    this.disposables.push(white);
    const strip = (x1: number, z1: number, x2: number, z2: number, w = 0.08) => {
      const dx = x2 - x1;
      const dz = z2 - z1;
      // Plane length along local Z after rotateX; then yaw it onto the segment.
      const geo = new THREE.PlaneGeometry(w, Math.hypot(dx, dz)).rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, white);
      m.rotation.y = Math.atan2(dx, dz);
      m.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
      this.disposables.push(m.geometry);
      this.root.add(m);
    };
    // Foul lines from the back corner of the plate to the wall.
    for (const side of [-1, 1]) {
      const end = fieldPoint(side * F.foulAngleDeg, F.fenceFoulLine);
      strip(0, 0, end.x, end.z, 0.1);
    }
    // Batter's boxes.
    for (const side of [-1, 1]) {
      const cx = side * 0.975;
      const hw = 0.61;
      const hl = 0.915;
      strip(cx - hw, -hl, cx + hw, -hl);
      strip(cx - hw, hl, cx + hw, hl);
      strip(cx - hw, -hl, cx - hw, hl);
      strip(cx + hw, -hl, cx + hw, hl);
    }
  }

  private buildOutfieldWall(physics: PhysicsWorld): void {
    const steps = 64;
    const span = F.foulAngleDeg + 3;
    const base: THREE.Vector3[] = [];
    const top: THREE.Vector3[] = [];
    const padTop: THREE.Vector3[] = [];
    const trackIn: THREE.Vector3[] = [];
    const trackOut: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = -span + (2 * span * i) / steps;
      const r = fenceDistance(a);
      base.push(fieldPoint(a, r, 0));
      top.push(fieldPoint(a, r, F.fenceHeight - 0.12));
      padTop.push(fieldPoint(a, r, F.fenceHeight));
      trackIn.push(fieldPoint(a, r - 4.5, 0.025));
      trackOut.push(fieldPoint(a, r, 0.025));
    }

    const track = new THREE.Mesh(ribbon(trackIn, trackOut), new THREE.MeshStandardMaterial({ color: 0x9c6a43, roughness: 1 }));
    this.add(track);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1d4a30, roughness: 0.9, side: THREE.DoubleSide });
    this.add(new THREE.Mesh(ribbon(base, top), wallMat));
    const pad = new THREE.Mesh(ribbon(top, padTop), new THREE.MeshBasicMaterial({ color: 0xf2c230, side: THREE.DoubleSide }));
    this.add(pad);

    // Foul poles.
    for (const side of [-1, 1]) {
      const p = fieldPoint(side * F.foulAngleDeg, F.fenceFoulLine);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 16, 8), new THREE.MeshStandardMaterial({ color: 0xf2c230 }));
      pole.position.set(p.x, 8, p.z);
      pole.castShadow = true;
      this.add(pole);
    }

    // Distance markers.
    for (const a of [-F.foulAngleDeg + 1.5, -22, 0, 22, F.foulAngleDeg - 1.5]) {
      const r = fenceDistance(a);
      const label = `${Math.round(r)}`;
      const tex = canvasTexture(256, 128, (ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 96px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 128, 68);
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      // Align with the local wall tangent (the wall isn't a circle around home).
      const p0 = fieldPoint(a - 1, fenceDistance(a - 1), 1.7);
      const p1 = fieldPoint(a + 1, fenceDistance(a + 1), 1.7);
      const inward = new THREE.Vector3(p1.z - p0.z, 0, -(p1.x - p0.x)).normalize();
      if (inward.dot(fieldPoint(a, 1)) > 0) inward.negate();
      sign.position.copy(fieldPoint(a, r, 1.7)).addScaledVector(inward, 0.25);
      sign.lookAt(sign.position.clone().add(inward));
      this.add(sign, false);
      this.disposables.push(tex);
    }

    // Wall colliders: one thin box per segment, inner face on the fence line.
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a0 = -span + (2 * span * i) / segs;
      const a1 = -span + (2 * span * (i + 1)) / segs;
      const p0 = fieldPoint(a0, fenceDistance(a0));
      const p1 = fieldPoint(a1, fenceDistance(a1));
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const out = mid.clone().setY(0).normalize().multiplyScalar(0.3);
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      physics.addStaticBox(
        { x: Math.hypot(dx, dz) / 2 + 0.05, y: F.fenceHeight / 2, z: 0.3 },
        { x: mid.x + out.x, y: F.fenceHeight / 2, z: mid.z + out.z },
        Math.atan2(-dz, dx),
        { restitution: 0.35, friction: 0.5 },
      );
    }
  }

  private buildStands(): void {
    const crowd = canvasTexture(256, 128, (ctx) => {
      ctx.fillStyle = '#3a4656';
      ctx.fillRect(0, 0, 256, 128);
      const colors = ['#d9dde3', '#c43d3d', '#2f5fa8', '#e8c24a', '#7a8796', '#1f2833', '#f0f0f0'];
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
        ctx.fillRect(Math.random() * 256, Math.random() * 128, 3, 3);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < 128; y += 8) ctx.fillRect(0, y, 256, 1);
    });
    const steps = 48;
    const span = F.foulAngleDeg + 40;
    const lower: THREE.Vector3[] = [];
    const upper: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = -span + (2 * span * i) / steps;
      // Beyond the fair-territory arc, wrap stands around foul territory at a fixed radius.
      const r = Math.abs(a) <= F.foulAngleDeg ? fenceDistance(a) : F.fenceFoulLine * (1 - (Math.abs(a) - F.foulAngleDeg) / 160);
      lower.push(fieldPoint(a, r + STANDS.gap, F.fenceHeight + 0.5));
      upper.push(fieldPoint(a, r + STANDS.gap + STANDS.depth, STANDS.topY));
    }
    const geo = ribbon(lower, upper, 1 / 24);
    const stands = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: crowd, roughness: 1, side: THREE.DoubleSide }));
    this.add(stands, false);
    this.disposables.push(crowd);
  }

  private buildColliders(physics: PhysicsWorld): void {
    physics.addStaticBox({ x: 400, y: 1, z: 400 }, { x: 0, y: -1, z: 0 }, 0, { restitution: 0.42, friction: 0.8 });
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.root.removeFromParent();
  }
}
