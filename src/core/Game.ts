import * as THREE from 'three';
import { CONFIG } from '../config';
import { SoundFX } from '../audio/SoundFX';
import { Baseball } from '../baseball/Baseball';
import type { PitchPlan, PitchTypeId } from '../baseball/Pitch';
import { PITCH_CATALOG } from '../baseball/Pitch';
import { PitchManager } from '../baseball/PitchManager';
import { Batter } from '../batter/Batter';
import { BatterController } from '../batter/BatterController';
import { computeBattedBall, sweepBatBall, type BattedBall } from '../batter/BatPhysics';
import { BallCamera } from '../camera/BallCamera';
import { BattingCamera } from '../camera/BattingCamera';
import { CameraDirector } from '../camera/CameraRig';
import { battedBallType, isInStrikeZone, OUTCOME_LABEL, type PlayOutcome, type PlayRecord } from '../gameplay/HitResult';
import { Telemetry } from '../gameplay/Telemetry';
import { judgeTiming, TIMING_LABEL } from '../gameplay/TimingJudge';
import { InputManager, type InputEvent } from '../input/InputManager';
import { KeyboardInput } from '../input/KeyboardInput';
import { PointerInput } from '../input/PointerInput';
import { PerformanceMonitor } from '../performance/PerformanceMonitor';
import { estimateLanding, horizontalDistance, MS_TO_KMH } from '../physics/BaseballPhysics';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { Catcher } from '../players/Catcher';
import { Pitcher } from '../players/Pitcher';
import { HUD, type CalloutKind } from '../ui/HUD';
import { Environment } from '../world/Environment';
import { fenceDistance, isFair, sprayAngleDeg, standsSurfaceY } from '../world/FieldDimensions';
import { Stadium, type Ballpark } from '../world/Stadium';
import { GameLoop } from './GameLoop';
import { GameStateMachine, Phase } from './GameState';

/** Everything that happened during the current pitch. */
interface PlayState {
  plan: PitchPlan | null;
  pitchStart: number;
  releaseTime: number;
  swung: boolean;
  timingDelta: number | null;
  plateCross: THREE.Vector3 | null;
  batted: BattedBall | null;
  estimatedDistance: number | null;
  landed: THREE.Vector3 | null;
  landedAt: number;
  homeRunAt: number;
  outcome: PlayOutcome | null;
}

const PHASE_LABEL: Record<Phase, string> = {
  [Phase.READY]: 'READY',
  [Phase.PITCHING]: 'PITCH',
  [Phase.BALL_IN_FLIGHT]: 'PITCH',
  [Phase.SWING]: 'SWING',
  [Phase.CONTACT]: 'CONTACT',
  [Phase.MISS]: 'MISS',
  [Phase.RESULT]: 'RESULT',
};

export interface GameOptions {
  pitches?: PitchTypeId[];
  debug?: boolean;
}

/**
 * Composition root + per-pitch gameplay rules. Systems (physics, batter, camera,
 * HUD, perf) don't know about each other; Game wires them together.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly perf = new PerformanceMonitor();
  readonly telemetry = new Telemetry();
  readonly state = new GameStateMachine();

  private director: CameraDirector;
  private battingCam = new BattingCamera();
  private ballCam: BallCamera;
  readonly stadium: Ballpark;
  private ball: Baseball;
  private pitcher: Pitcher;
  private catcher: Catcher;
  private batter: Batter;
  private controller: BatterController;
  private pitchManager: PitchManager;
  private input = new InputManager();
  private sfx = new SoundFX();
  private hud: HUD;
  private loop: GameLoop;
  private simTime = 0;
  private hitStopUntil = 0;
  private play: PlayState = Game.emptyPlay();
  private pitchMarker: THREE.Mesh;

  private constructor(
    private container: HTMLElement,
    private physics: PhysicsWorld,
    opts: GameOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.append(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 1500);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    new Environment(this.scene);
    this.stadium = new Stadium(this.scene, physics);
    this.ball = new Baseball(this.scene, physics);
    this.pitcher = new Pitcher(this.scene);
    this.catcher = new Catcher(this.scene);
    this.batter = new Batter(this.scene);
    this.controller = new BatterController(this.batter, () =>
      this.play.plan && this.state.is(Phase.PITCHING, Phase.BALL_IN_FLIGHT) ? this.play.plan.contactPoint : null,
    );
    this.pitchManager = new PitchManager(opts.pitches);
    this.buildStrikeZone();
    this.pitchMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.045, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.pitchMarker.visible = false;
    this.scene.add(this.pitchMarker);
    if (opts.debug) this.batter.bat.collider.visible = true;

    this.ballCam = new BallCamera({ position: this.ball.mesh.position, velocity: this.ball.velocity });
    this.director = new CameraDirector(this.camera, this.battingCam);

    this.hud = new HUD(document.body);
    this.hud.updateSession(this.telemetry.stats());
    this.state.onChange((to) => this.hud.setPhase(PHASE_LABEL[to]));

    this.input.add(new KeyboardInput()).add(new PointerInput(this.renderer.domElement));
    this.input.onAny(() => this.sfx.unlock());

    this.loop = new GameLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      render: (alpha, realDt, steps) => this.render(alpha, realDt, steps),
    });
  }

  static async create(container: HTMLElement, opts: GameOptions = {}): Promise<Game> {
    const physics = await PhysicsWorld.create();
    return new Game(container, physics, opts);
  }

  private static emptyPlay(): PlayState {
    return {
      plan: null,
      pitchStart: 0,
      releaseTime: 0,
      swung: false,
      timingDelta: null,
      plateCross: null,
      batted: null,
      estimatedDistance: null,
      landed: null,
      landedAt: 0,
      homeRunAt: 0,
      outcome: null,
    };
  }

  start(): void {
    this.precompile();
    this.loop.start();
  }

  get enabledPitches(): readonly PitchTypeId[] {
    return this.pitchManager.enabledPitches;
  }

  // ---------------------------------------------------------------- simulation

  private fixedUpdate(dt: number): void {
    this.perf.begin('sim');
    this.simTime += dt;
    for (const e of this.input.drain()) this.handleInput(e);

    const t = this.state.elapsed(this.simTime);
    switch (this.state.phase) {
      case Phase.READY:
        if (t >= CONFIG.flow.readyDelay) this.startPitch();
        break;
      case Phase.PITCHING:
        if (t >= CONFIG.pitcher.windupTime) this.release();
        break;
    }

    this.ball.prePhysics(dt);
    this.perf.begin('physics');
    this.physics.step();
    this.perf.end('physics');
    this.ball.postPhysics();
    this.batter.update(this.simTime);

    switch (this.state.phase) {
      case Phase.BALL_IN_FLIGHT:
      case Phase.SWING:
        this.updatePitchInFlight(dt);
        break;
      case Phase.CONTACT:
        this.updateBattedBall();
        break;
      case Phase.MISS:
        if (t >= CONFIG.flow.missHold) this.state.transition(Phase.RESULT, this.simTime);
        break;
      case Phase.RESULT: {
        const hold = this.play.batted ? CONFIG.flow.resultHold : CONFIG.flow.missHold;
        if (t >= hold) this.toReady();
        break;
      }
    }
    this.perf.end('sim');
  }

  private handleInput(e: InputEvent): void {
    switch (e.action) {
      case 'swing':
        this.trySwing();
        break;
      case 'reset':
        this.toReady(CONFIG.flow.readyDelay - 0.35);
        break;
      case 'toggleMute':
        this.hud.setMuted(this.sfx.toggleMute());
        break;
      case 'toggleDebug':
        this.batter.bat.collider.visible = !this.batter.bat.collider.visible;
        break;
    }
  }

  private trySwing(): void {
    if (!this.state.is(Phase.READY, Phase.PITCHING, Phase.BALL_IN_FLIGHT)) return;
    const swing = this.controller.swing(this.simTime);
    if (!swing) return;
    this.sfx.whoosh();
    const plan = this.play.plan;
    if (!plan || this.state.is(Phase.READY)) return; // practice swing

    this.play.swung = true;
    // When would the ball reach the ideal contact plane vs. when does the bat get there?
    const ballAtContact = this.play.pitchStart + CONFIG.pitcher.windupTime + plan.timeToContact;
    this.play.timingDelta = swing.startTime + CONFIG.swing.timeToContact - ballAtContact;
    if (this.state.is(Phase.BALL_IN_FLIGHT)) this.state.transition(Phase.SWING, this.simTime);
  }

  private startPitch(): void {
    const plan = this.pitchManager.plan();
    this.play = Game.emptyPlay();
    this.play.plan = plan;
    this.play.pitchStart = this.simTime;
    this.catcher.setTarget(plan.target.x, plan.target.y);
    this.hud.setPitch(plan.type.name, null);
    this.hud.setTiming(null, null);
    this.hud.clearTiming();
    this.hud.setHit(null, null, null);
    this.pitchMarker.visible = false;
    this.state.transition(Phase.PITCHING, this.simTime);
  }

  private release(): void {
    const plan = this.play.plan!;
    this.ball.launch(plan.release, plan.velocity, plan.spin);
    this.play.releaseTime = this.simTime;
    this.hud.setPitch(plan.type.name, plan.speed * MS_TO_KMH);
    this.state.transition(Phase.BALL_IN_FLIGHT, this.simTime);
  }

  private updatePitchInFlight(dt: number): void {
    const b = this.ball;
    if (!this.play.plateCross && b.prevPosition.z < 0 && b.position.z >= 0) {
      const f = -b.prevPosition.z / (b.position.z - b.prevPosition.z);
      this.play.plateCross = b.prevPosition.clone().lerp(b.position, f);
    }

    const swing = this.batter.currentSwing;
    if (swing) {
      const contact = sweepBatBall(swing, b.prevPosition, b.position, this.simTime - dt, this.simTime);
      if (contact) {
        this.onContact(contact);
        return;
      }
    }

    const inFlight = this.simTime - this.play.releaseTime;
    if (b.position.z >= CONFIG.catcher.catchZ || inFlight > 2.5) this.onCaught();
  }

  private onContact(contact: NonNullable<ReturnType<typeof sweepBatBall>>): void {
    const pitchSpeed = this.ball.velocity.length();
    const delta = this.play.timingDelta ?? 0;
    const batted = computeBattedBall(contact, pitchSpeed, delta);
    this.ball.redirect(contact.ballPosition, batted.velocity, batted.spin);

    const landing = estimateLanding(contact.ballPosition, batted.velocity, batted.spin);
    this.play.batted = batted;
    this.play.estimatedDistance = horizontalDistance(landing.position);
    this.state.transition(Phase.CONTACT, this.simTime);

    const evKmh = batted.exitSpeed * MS_TO_KMH;
    this.hud.setTiming(batted.judgment, delta * 1000);
    this.hud.setHit(evKmh, batted.launchDeg, this.play.estimatedDistance, true);
    const kind: CalloutKind = batted.judgment === 'PERFECT' ? 'great' : batted.judgment.startsWith('TOO') ? 'bad' : 'good';
    this.hud.showCallout(TIMING_LABEL[batted.judgment].toUpperCase(), kind);

    const quality = Math.min(1, Math.max(0, (batted.exitSpeed - 15) / 30));
    this.sfx.crack(quality);
    this.director.addShake(CONFIG.feel.shakeOnContact * quality);
    const stop = batted.judgment === 'PERFECT' ? CONFIG.feel.hitStopPerfect : quality > 0.6 ? CONFIG.feel.hitStopGood : 0;
    if (stop > 0) {
      this.loop.timeScale = CONFIG.feel.hitStopTimeScale;
      this.hitStopUntil = performance.now() + stop * 1000;
    }
  }

  private updateBattedBall(): void {
    const t = this.state.elapsed(this.simTime);
    const p = this.play;
    const b = this.ball.position;
    if (t > 0.1) this.director.setRig(this.ballCam);

    const spray = sprayAngleDeg(b.x, b.z);
    const r = Math.hypot(b.x, b.z);

    if (!p.landed && !p.homeRunAt && b.z < 0 && Math.abs(spray) <= CONFIG.field.foulAngleDeg) {
      if (r >= fenceDistance(spray) - 0.2 && b.y > CONFIG.field.fenceHeight) {
        p.homeRunAt = this.simTime;
        p.outcome = 'HOME_RUN';
        this.hud.showCallout('HOME RUN!', 'great', this.resultLine());
        this.sfx.cheer(1);
      }
    }

    // Home runs land in the seats (the stands are visual only, no collider).
    if (p.homeRunAt && this.ball.active && b.y <= standsSurfaceY(spray, r)) this.ball.freeze();

    if (!p.landed && t > 0.05 && this.ball.onGround) {
      p.landed = b.clone();
      p.landedAt = this.simTime;
      if (!p.outcome) {
        p.outcome = isFair(b.x, b.z) ? battedBallType(p.batted!.launchDeg) : 'FOUL';
      }
      if (p.outcome !== 'HOME_RUN') this.hud.setHit(p.batted!.exitSpeed * MS_TO_KMH, p.batted!.launchDeg, horizontalDistance(p.landed));
    }

    const done =
      (p.homeRunAt && this.simTime - p.homeRunAt > 2.2) ||
      (p.outcome === 'FOUL' && this.simTime - p.landedAt > 0.8) ||
      (p.landed && this.simTime - p.landedAt > CONFIG.flow.rollAfterLanding) ||
      t > CONFIG.flow.maxBattedFlightTime;
    if (done) this.finishBattedBall();
  }

  private battedDistance(): number {
    const p = this.play;
    if (p.outcome === 'HOME_RUN' || !p.landed) return p.estimatedDistance ?? 0;
    // Ground balls: report how far it got (roll included); air balls: carry.
    if (p.outcome === 'GROUND_BALL') return Math.max(horizontalDistance(p.landed), horizontalDistance(this.ball.position));
    return horizontalDistance(p.landed);
  }

  private resultLine(): string {
    const bb = this.play.batted!;
    return `${(bb.exitSpeed * MS_TO_KMH).toFixed(0)} km/h · ${bb.launchDeg.toFixed(0)}° · ${this.battedDistance().toFixed(0)} m`;
  }

  private finishBattedBall(): void {
    const p = this.play;
    const bb = p.batted!;
    if (!p.outcome) p.outcome = isFair(this.ball.position.x, this.ball.position.z) ? battedBallType(bb.launchDeg) : 'FOUL';
    const dist = this.battedDistance();
    this.hud.setHit(bb.exitSpeed * MS_TO_KMH, bb.launchDeg, dist);
    if (p.outcome !== 'HOME_RUN') {
      this.hud.showCallout(OUTCOME_LABEL[p.outcome], p.outcome === 'FOUL' ? 'neutral' : 'good', this.resultLine());
    }
    this.record(dist);
    this.state.transition(Phase.RESULT, this.simTime);
  }

  private onCaught(): void {
    const p = this.play;
    this.ball.freeze();
    this.sfx.mitt();
    if (p.plateCross) {
      this.pitchMarker.position.set(p.plateCross.x, p.plateCross.y, 0.01);
      this.pitchMarker.visible = true;
    }
    const inZone = p.plateCross ? isInStrikeZone(p.plateCross.x, p.plateCross.y) : false;
    if (p.swung && p.timingDelta !== null) {
      p.outcome = 'SWING_MISS';
      const j = judgeTiming(p.timingDelta);
      this.hud.setTiming(j, p.timingDelta * 1000);
      this.hud.showCallout('SWING & MISS', 'bad', TIMING_LABEL[j]);
      this.record(null);
      this.state.transition(Phase.MISS, this.simTime);
    } else {
      p.outcome = inZone ? 'STRIKE_LOOKING' : 'BALL';
      this.hud.showCallout(inZone ? 'STRIKE' : 'BALL', 'neutral', inZone ? 'looking' : '');
      this.record(null);
      this.state.transition(Phase.RESULT, this.simTime);
    }
  }

  private record(distance: number | null): void {
    const p = this.play;
    const bb = p.batted;
    const rec: PlayRecord = {
      pitchType: p.plan?.type.id ?? 'unknown',
      pitchSpeedKmh: (p.plan?.speed ?? 0) * MS_TO_KMH,
      swung: p.swung,
      timingMs: p.timingDelta === null ? null : p.timingDelta * 1000,
      judgment: p.timingDelta === null ? null : judgeTiming(p.timingDelta),
      contact: !!bb,
      exitVelocityKmh: bb ? bb.exitSpeed * MS_TO_KMH : null,
      launchDeg: bb ? bb.launchDeg : null,
      sprayDeg: bb ? bb.sprayDeg : null,
      distanceM: distance,
      outcome: p.outcome ?? 'BALL',
    };
    this.telemetry.add(rec);
    this.hud.updateSession(this.telemetry.stats());
  }

  /** Back to READY; `head start` shortens the wait before the next pitch. */
  private toReady(headStart = 0): void {
    this.ball.hide();
    this.batter.cancel();
    this.director.setRig(this.battingCam);
    this.loop.timeScale = 1;
    this.state.reset(this.simTime - headStart);
    this.pitcher.pose(0, 0);
  }

  // ---------------------------------------------------------------- rendering

  private render(alpha: number, realDt: number, steps: number): void {
    this.perf.beginFrame();
    this.perf.countPhysicsSteps(steps);
    if (this.loop.timeScale < 1 && performance.now() >= this.hitStopUntil) this.loop.timeScale = 1;

    // Interpolated sim time for smooth animation between 120 Hz steps.
    const renderTime = this.simTime - (1 - alpha) * CONFIG.physics.fixedDt;
    const t = this.state.elapsed(renderTime);
    if (this.state.is(Phase.PITCHING)) this.pitcher.pose(t / CONFIG.pitcher.windupTime, 0);
    else if (this.play.releaseTime > 0) this.pitcher.pose(1, (renderTime - this.play.releaseTime) / 0.5);

    this.ball.render(alpha, realDt * this.loop.timeScale);
    this.batter.render(renderTime);
    this.catcher.update(realDt);
    this.director.update(realDt);

    this.perf.begin('render');
    this.renderer.render(this.scene, this.camera);
    this.perf.end('render');
    this.perf.sampleRenderer(this.renderer);
    if (this.hud.perfDue()) this.hud.updatePerf(this.perf.snapshot());
  }

  /** Compile every shader up front so the first pitch / contact doesn't hitch. */
  private precompile(): void {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    this.renderer.compile(this.scene, this.camera);
    for (const o of hidden) o.visible = false;
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildStrikeZone(): THREE.LineSegments {
    const z = CONFIG.strikeZone;
    const box = new THREE.EdgesGeometry(new THREE.PlaneGeometry(z.halfWidth * 2, z.top - z.bottom));
    const lines = new THREE.LineSegments(box, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    lines.position.set(0, (z.top + z.bottom) / 2, 0);
    this.scene.add(lines);
    return lines;
  }
}

export function parsePitchList(param: string | null): PitchTypeId[] | undefined {
  if (!param) return undefined;
  const ids = param.split(',').map((s) => s.trim()) as PitchTypeId[];
  const valid = ids.filter((id) => id in PITCH_CATALOG);
  return valid.length ? valid : undefined;
}
