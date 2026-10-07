import { aimSwing, STANCE_GEOMETRY, type Swing } from './BatPhysics';
import type { Batter } from './Batter';

/**
 * Turns the abstract "swing" intent into a concrete swing. Today aim is automatic
 * (arcade); a future controller can take aim from mouse / gyro / hand tracking and
 * pass it in instead — Batter and BatPhysics don't change.
 */
export class BatterController {
  constructor(
    private batter: Batter,
    /** Predicted ball center at the contact plane, or null when no pitch is live. */
    private predictContact: () => { x: number; y: number } | null,
  ) {}

  swing(time: number): Swing | null {
    const predicted = this.predictContact();
    return this.batter.startSwing(time, predicted ? aimSwing(predicted) : { ...STANCE_GEOMETRY });
  }
}
