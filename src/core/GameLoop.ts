import { CONFIG } from '../config';

export interface LoopCallbacks {
  /** Fixed-timestep simulation (physics, gameplay). */
  fixedUpdate(dt: number): void;
  /** Once per displayed frame. `alpha` = interpolation factor between fixed steps. */
  render(alpha: number, realDt: number, steps: number): void;
}

/**
 * Fixed-timestep loop (accumulator) with variable-rate rendering. Physics runs at
 * CONFIG.physics.fixedDt regardless of display refresh, so 60/120/144 Hz screens
 * play identically. `timeScale` drives hit-stop / slow motion.
 */
export class GameLoop {
  timeScale = 1;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(private cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      // Clamp long gaps (tab switch, breakpoints) to avoid a spiral of death.
      const realDt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const dt = CONFIG.physics.fixedDt;
      this.acc += realDt * this.timeScale;
      let steps = 0;
      while (this.acc >= dt && steps < CONFIG.physics.maxStepsPerFrame) {
        this.cb.fixedUpdate(dt);
        this.acc -= dt;
        steps++;
      }
      if (steps === CONFIG.physics.maxStepsPerFrame) this.acc = 0;
      this.cb.render(this.acc / dt, realDt, steps);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
