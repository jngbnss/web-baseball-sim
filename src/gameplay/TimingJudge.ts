import { CONFIG } from '../config';

export type TimingJudgment = 'TOO_EARLY' | 'EARLY' | 'PERFECT' | 'LATE' | 'TOO_LATE';

export const TIMING_LABEL: Record<TimingJudgment, string> = {
  TOO_EARLY: 'Too Early',
  EARLY: 'Early',
  PERFECT: 'Perfect',
  LATE: 'Late',
  TOO_LATE: 'Too Late',
};

/**
 * `delta` = (time the bat reaches the ideal contact angle)
 *         - (time the ball reaches the ideal contact plane), in seconds.
 * Negative means the swing was early.
 */
export function judgeTiming(delta: number): TimingJudgment {
  const a = Math.abs(delta);
  if (a <= CONFIG.timing.perfect) return 'PERFECT';
  if (a <= CONFIG.timing.good) return delta < 0 ? 'EARLY' : 'LATE';
  return delta < 0 ? 'TOO_EARLY' : 'TOO_LATE';
}

export function timingFactor(j: TimingJudgment): number {
  return CONFIG.timing.factor[j];
}
