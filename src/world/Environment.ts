import * as THREE from 'three';

/**
 * Sky, fog and lighting. Kept separate from the Stadium so a GLB stadium can be
 * dropped in without redoing the lighting setup (and vice versa for HDRI later).
 */
export class Environment {
  readonly sun: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    const horizon = new THREE.Color(0xcfe3f2);
    scene.fog = new THREE.Fog(horizon, 180, 520);
    scene.background = horizon;

    // Gradient sky dome (one draw call, no textures).
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(0x2f6fb8) },
          horizon: { value: horizon },
        },
        vertexShader: /* glsl */ `
          varying float vH;
          void main() {
            vH = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; varying float vH;
          void main() {
            float t = pow(clamp(vH, 0.0, 1.0), 0.55);
            gl_FragColor = vec4(mix(horizon, top, t), 1.0);
          }`,
      }),
    );
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    scene.add(sky);

    scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a6b3a, 1.1));

    this.sun = new THREE.DirectionalLight(0xfff3dd, 2.2);
    this.sun.position.set(-30, 60, 25);
    this.sun.target.position.set(0, 0, -12);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -28;
    cam.right = 28;
    cam.top = 28;
    cam.bottom = -28;
    cam.near = 10;
    cam.far = 140;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun, this.sun.target);
  }
}
