import type * as THREE from 'three';

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  /** 95th percentile frame time over the sample window (stutter indicator). */
  frameP95Ms: number;
  /** Per-section CPU time (ms, smoothed): e.g. physics, update, render. */
  sections: Record<string, number>;
  physicsSteps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  heapMB: number | null;
}

/**
 * Game-agnostic performance probe. Game code only calls `beginFrame/endFrame`,
 * `begin/end(section)` and `sampleRenderer`; everything else (overlay, export,
 * future A/B experiments: LOD, instancing, KTX2, WebGPU, ...) reads snapshots.
 */
export class PerformanceMonitor {
  private frameTimes = new Float32Array(240);
  private frameIndex = 0;
  private frameCount = 0;
  private lastFrameStart = 0;
  private open = new Map<string, number>();
  private sections: Record<string, number> = {};
  private steps = 0;
  private renderInfo = { calls: 0, triangles: 0, geometries: 0, textures: 0 };

  beginFrame(now = performance.now()): void {
    if (this.lastFrameStart > 0) {
      this.frameTimes[this.frameIndex] = now - this.lastFrameStart;
      this.frameIndex = (this.frameIndex + 1) % this.frameTimes.length;
      this.frameCount = Math.min(this.frameCount + 1, this.frameTimes.length);
    }
    this.lastFrameStart = now;
  }

  begin(section: string): void {
    this.open.set(section, performance.now());
  }

  end(section: string): void {
    const t0 = this.open.get(section);
    if (t0 === undefined) return;
    const ms = performance.now() - t0;
    const prev = this.sections[section];
    this.sections[section] = prev === undefined ? ms : prev + (ms - prev) * 0.1;
  }

  countPhysicsSteps(n: number): void {
    this.steps = n;
  }

  /** Call right after renderer.render(): `info` is reset at the start of each render. */
  sampleRenderer(renderer: THREE.WebGLRenderer): void {
    const i = renderer.info;
    this.renderInfo.calls = i.render.calls;
    this.renderInfo.triangles = i.render.triangles;
    this.renderInfo.geometries = i.memory.geometries;
    this.renderInfo.textures = i.memory.textures;
  }

  snapshot(): PerfSnapshot {
    const n = this.frameCount;
    let sum = 0;
    const sorted: number[] = [];
    for (let k = 0; k < n; k++) {
      // Most recent 60 frames for the average, whole window for p95.
      const idx = (this.frameIndex - 1 - k + this.frameTimes.length) % this.frameTimes.length;
      const v = this.frameTimes[idx];
      if (k < 60) sum += v;
      sorted.push(v);
    }
    sorted.sort((a, b) => a - b);
    const avg = n ? sum / Math.min(n, 60) : 0;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      fps: avg > 0 ? 1000 / avg : 0,
      frameMs: avg,
      frameP95Ms: n ? sorted[Math.min(n - 1, Math.floor(n * 0.95))] : 0,
      sections: { ...this.sections },
      physicsSteps: this.steps,
      drawCalls: this.renderInfo.calls,
      triangles: this.renderInfo.triangles,
      geometries: this.renderInfo.geometries,
      textures: this.renderInfo.textures,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
    };
  }
}
