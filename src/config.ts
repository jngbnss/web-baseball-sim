/**
 * Every gameplay/physics tuning number lives here so feel can be iterated
 * without hunting through systems. Units: meters, seconds, radians unless noted.
 *
 * Coordinate system:
 *   - Home plate center at the origin, +Y up.
 *   - The pitcher's mound is toward -Z, the catcher toward +Z.
 *   - First base is at (+x, -z), third base at (-x, -z).
 *   - The (right-handed) batter stands on the -X side of the plate.
 */
export const CONFIG = {
  physics: {
    fixedDt: 1 / 120,
    gravity: -9.81,
    maxStepsPerFrame: 8,
  },

  ball: {
    radius: 0.0366,
    mass: 0.145,
    restitution: 0.45,
    friction: 0.6,
    /** Quadratic drag: a = -dragK * |v| * v  (0.5 * rho * Cd * A / m). */
    dragK: 0.0062,
    /** Magnus: a = magnusK * (spin x v). spin in rad/s. */
    magnusK: 6.0e-4,
    /** Spin decay (fraction per second) while airborne. */
    spinDecay: 0.05,
    trailLength: 48,
  },

  field: {
    moundZ: -18.44,
    baseDistance: 27.43,
    fenceFoulLine: 99,
    fenceCenter: 122,
    fenceHeight: 3.0,
    foulAngleDeg: 45,
  },

  strikeZone: {
    halfWidth: 0.216,
    bottom: 0.48,
    top: 1.07,
  },

  pitcher: {
    /** Right-handed pitcher release point (arm side is -X when facing home). */
    release: { x: -0.45, y: 1.8, z: -17.0 },
    windupTime: 0.9,
    /** Probability a pitch is aimed inside the strike zone. */
    strikeRate: 0.8,
  },

  catcher: {
    z: 1.6,
    /** Ball is considered caught once it passes this Z without contact. */
    catchZ: 1.2,
  },

  bat: {
    /** Hands / swing pivot (right-handed batter, -X side of the plate). */
    pivotX: -0.72,
    pivotZ: -0.3,
    length: 0.95,
    /** Bat starts this far from the pivot (hands). */
    handleStart: 0.05,
    barrelRadius: 0.034,
    handleRadius: 0.013,
    /** Collision radius used for the swept bat-ball test (arcade-generous). */
    collisionRadius: 0.055,
    /** Sweet spot as distance from the pivot. */
    sweetSpot: 0.74,
    /** Max auto-adjust of the hands toward/away from the plate per pitch location. */
    reach: 0.12,
  },

  swing: {
    /** Bat yaw angle at stance (0 = bat pointing at the catcher, +PI/2 = across the plate). */
    startAngle: (-15 * Math.PI) / 180,
    /** Bat yaw where the barrel is perpendicular to the pitch: ideal contact. */
    contactAngle: Math.PI / 2,
    endAngle: (270 * Math.PI) / 180,
    /** Seconds from swing start to the ideal contact angle. */
    timeToContact: 0.16,
    /** Hold at follow-through, then recover to stance. */
    followHold: 0.25,
    recoverTime: 0.35,
    /** Swing-plane rise per radian of yaw (early contact = bat higher = grounder). */
    planeSlope: 0.07,
    /** Auto-aim puts the bat axis this far below the predicted ball center (lift). */
    aimBelowBall: 0.014,
    /** Random aim jitter so every perfect swing isn't identical. */
    aimJitter: 0.012,
    stanceHandsHeight: 1.25,
    practicePlaneHeight: 0.85,
  },

  hit: {
    /** Collision efficiency in BBS = q * vPitch + (1 + q) * vBat. */
    q: 0.2,
    /** Bat speed (m/s) at the sweet spot at the ideal contact angle. */
    batSpeed: 35,
    baseLaunchDeg: 5,
    launchPerOffsetDeg: 60,
    /** Exit velocity loss when contact is off-center vertically (factor = 1 - k*u^2). */
    centerPenalty: 0.55,
    minSweetFactor: 0.45,
    sweetWidth: 0.42,
  },

  timing: {
    /** |delta| thresholds in seconds. */
    perfect: 0.016,
    good: 0.034,
    factor: { PERFECT: 1.0, EARLY: 0.9, LATE: 0.9, TOO_EARLY: 0.74, TOO_LATE: 0.74 },
    meterRange: 0.12,
  },

  flow: {
    readyDelay: 1.3,
    missHold: 0.8,
    resultHold: 2.6,
    maxBattedFlightTime: 9,
    rollAfterLanding: 1.6,
  },

  feel: {
    hitStopPerfect: 0.09,
    hitStopGood: 0.04,
    hitStopTimeScale: 0.08,
    shakeOnContact: 0.12,
  },

  camera: {
    fov: 50,
    batting: { x: 0.5, y: 2.3, z: 4.4, lookX: 0, lookY: 0.9, lookZ: -14 },
    followDistance: 13,
    followHeight: 5,
    smoothing: 4.5,
    returnSmoothing: 3.0,
  },
} as const;

export type Config = typeof CONFIG;
