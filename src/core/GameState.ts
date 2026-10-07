/**
 * Explicit game flow for one pitch:
 *
 *   READY -> PITCHING (windup) -> BALL_IN_FLIGHT -> SWING -> CONTACT | MISS -> RESULT -> READY
 *                                              \-> (take) ------------------> RESULT
 *
 * Future layers (count, outs, innings, runners) should sit *above* this machine and
 * react to RESULT, rather than adding more states here.
 */
export enum Phase {
  READY = 'READY',
  PITCHING = 'PITCHING',
  BALL_IN_FLIGHT = 'BALL_IN_FLIGHT',
  SWING = 'SWING',
  CONTACT = 'CONTACT',
  MISS = 'MISS',
  RESULT = 'RESULT',
}

const TRANSITIONS: Record<Phase, Phase[]> = {
  [Phase.READY]: [Phase.PITCHING],
  [Phase.PITCHING]: [Phase.BALL_IN_FLIGHT, Phase.READY],
  [Phase.BALL_IN_FLIGHT]: [Phase.SWING, Phase.CONTACT, Phase.MISS, Phase.RESULT, Phase.READY],
  [Phase.SWING]: [Phase.CONTACT, Phase.MISS, Phase.READY],
  [Phase.CONTACT]: [Phase.RESULT, Phase.READY],
  [Phase.MISS]: [Phase.RESULT, Phase.READY],
  [Phase.RESULT]: [Phase.READY],
};

export type PhaseListener = (to: Phase, from: Phase) => void;

export class GameStateMachine {
  private _phase = Phase.READY;
  private enteredAt = 0;
  private listeners: PhaseListener[] = [];

  get phase(): Phase {
    return this._phase;
  }

  /** Seconds spent in the current phase (sim time). */
  elapsed(now: number): number {
    return now - this.enteredAt;
  }

  is(...phases: Phase[]): boolean {
    return phases.includes(this._phase);
  }

  can(to: Phase): boolean {
    return TRANSITIONS[this._phase].includes(to);
  }

  transition(to: Phase, now: number): boolean {
    if (!this.can(to)) {
      console.warn(`[GameState] illegal transition ${this._phase} -> ${to}`);
      return false;
    }
    const from = this._phase;
    this._phase = to;
    this.enteredAt = now;
    for (const l of this.listeners) l(to, from);
    return true;
  }

  /** Hard reset (R key) — always allowed. */
  reset(now: number): void {
    const from = this._phase;
    this._phase = Phase.READY;
    this.enteredAt = now;
    for (const l of this.listeners) l(Phase.READY, from);
  }

  onChange(listener: PhaseListener): void {
    this.listeners.push(listener);
  }
}
