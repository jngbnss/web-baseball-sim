import type { InputAction, InputSource } from './InputManager';

const BINDINGS: Record<string, InputAction> = {
  Space: 'swing',
  KeyR: 'reset',
  KeyM: 'toggleMute',
  KeyC: 'toggleDebug',
};

export class KeyboardInput implements InputSource {
  readonly name = 'keyboard';
  private handler?: (e: KeyboardEvent) => void;

  attach(emit: (action: InputAction, timestamp: number) => void): void {
    this.handler = (e) => {
      const action = BINDINGS[e.code];
      if (!action || e.repeat) return;
      e.preventDefault();
      emit(action, e.timeStamp);
    };
    window.addEventListener('keydown', this.handler);
  }

  detach(): void {
    if (this.handler) window.removeEventListener('keydown', this.handler);
  }
}
