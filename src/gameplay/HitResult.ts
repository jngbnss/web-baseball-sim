import { CONFIG } from '../config';
import type { TimingJudgment } from './TimingJudge';

export type PlayOutcome =
  | 'HOME_RUN'
  | 'FOUL'
  | 'LINE_DRIVE'
  | 'FLY_BALL'
  | 'GROUND_BALL'
  | 'POP_UP'
  | 'SWING_MISS'
  | 'STRIKE_LOOKING'
  | 'BALL';

export const OUTCOME_LABEL: Record<PlayOutcome, string> = {
  HOME_RUN: 'HOME RUN!',
  FOUL: 'FOUL BALL',
  LINE_DRIVE: 'LINE DRIVE',
  FLY_BALL: 'FLY BALL',
  GROUND_BALL: 'GROUND BALL',
  POP_UP: 'POP UP',
  SWING_MISS: 'SWING & MISS',
  STRIKE_LOOKING: 'STRIKE (LOOKING)',
  BALL: 'BALL',
};

/** Fair batted-ball type by launch angle (Statcast-style buckets). */
export function battedBallType(launchDeg: number): PlayOutcome {
  if (launchDeg < 10) return 'GROUND_BALL';
  if (launchDeg < 25) return 'LINE_DRIVE';
  if (launchDeg < 50) return 'FLY_BALL';
  return 'POP_UP';
}

export function isInStrikeZone(x: number, y: number): boolean {
  const z = CONFIG.strikeZone;
  const r = CONFIG.ball.radius;
  return Math.abs(x) <= z.halfWidth + r && y >= z.bottom - r && y <= z.top + r;
}

/** One pitch worth of data: what the telemetry log and HUD consume. */
export interface PlayRecord {
  pitchType: string;
  pitchSpeedKmh: number;
  swung: boolean;
  timingMs: number | null;
  judgment: TimingJudgment | null;
  contact: boolean;
  exitVelocityKmh: number | null;
  launchDeg: number | null;
  sprayDeg: number | null;
  distanceM: number | null;
  outcome: PlayOutcome;
}
