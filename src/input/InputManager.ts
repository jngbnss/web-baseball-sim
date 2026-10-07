/**
 * Device-agnostic input. Devices (keyboard, pointer/touch, and later gamepad,
 * gyroscope, MediaPipe) are `InputSource`s that emit semantic actions; game code
 * only ever sees actions.
 *
 *   KeyboardInput / PointerInput / (Gamepad / Mobile / MediaPipe)
 *        -> InputManager (queue) -> BatterController -> BatPhysics
 */
export type InputAction = 'swing' | 'reset' | 'toggleMute' | 'toggleDebug';

export interface InputEvent {
  action: InputAction;
  /** performance.now() timestamp of the physical event (for latency analysis). */
  timestamp: number;
  source: string;
}

export interface InputSource {
  readonly name: string;
  attach(emit: (action: InputAction, timestamp: number) => void): void;
  detach(): void;
}

export class InputManager {
  private sources: InputSource[] = [];
  private queue: InputEvent[] = [];
  private listeners: ((e: InputEvent) => void)[] = [];

  add(source: InputSource): this {
    source.attach((action, timestamp) => {
      const e: InputEvent = { action, timestamp, source: source.name };
      this.queue.push(e);
      for (const l of this.listeners) l(e);
    });
    this.sources.push(source);
    return this;
  }

  /** Immediate notification (e.g. unlocking audio inside a user gesture). */
  onAny(listener: (e: InputEvent) => void): void {
    this.listeners.push(listener);
  }

  /** Consumed by the fixed-step update, so actions are processed deterministically. */
  drain(): InputEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  dispose(): void {
    for (const s of this.sources) s.detach();
    this.sources = [];
  }
}
