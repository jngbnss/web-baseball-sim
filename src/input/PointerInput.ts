import type { InputAction, InputSource } from './InputManager';

/** Click / tap anywhere on the canvas to swing (makes the prototype playable on phones). */
export class PointerInput implements InputSource {
  readonly name = 'pointer';
  private handler?: (e: PointerEvent) => void;

  constructor(private target: HTMLElement) {}

  attach(emit: (action: InputAction, timestamp: number) => void): void {
    this.handler = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      emit('swing', e.timeStamp);
    };
    this.target.addEventListener('pointerdown', this.handler);
  }

  detach(): void {
    if (this.handler) this.target.removeEventListener('pointerdown', this.handler);
  }
}
