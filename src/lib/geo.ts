/**
 * Site geometry. Site frame: metres, +x east, +y north; bearings in degrees clockwise from north.
 * three.js ground plane is XZ with north = -Z, so site (x, y) maps to world (x, 0, -y).
 */

export const DEG = Math.PI / 180

export function toWorld(x: number, y: number, h = 0): [number, number, number] {
  return [x, h, -y]
}

/** Rotation about world Y for a site bearing (clockwise from north). */
export function bearingToRotY(bearingDeg: number) {
  return -bearingDeg * DEG
}

/** Math angle (radians, counter-clockwise from east) for a site bearing. */
export function bearingToMathRad(bearingDeg: number) {
  return (90 - bearingDeg) * DEG
}

export function bearingOf(dx: number, dy: number) {
  const b = Math.atan2(dx, dy) / DEG
  return (b + 360) % 360
}

/** Closest point of approach for an object relative to a static point. t is null if it's moving away. */
export function cpa(rx: number, ry: number, vx: number, vy: number) {
  const vv = vx * vx + vy * vy
  if (vv < 1e-6) return { t: null, d: Math.hypot(rx, ry) }
  const t = -(rx * vx + ry * vy) / vv
  if (t <= 0) return { t: null, d: Math.hypot(rx, ry) }
  return { t, d: Math.hypot(rx + vx * t, ry + vy * t) }
}

/** Where an object is relative to the operator's facing direction. */
export function relativeSide(objBearing: number, facingDeg: number): 'ahead' | 'right' | 'behind' | 'left' {
  const rel = (objBearing - facingDeg + 540) % 360 - 180
  if (Math.abs(rel) <= 45) return 'ahead'
  if (Math.abs(rel) >= 135) return 'behind'
  return rel > 0 ? 'right' : 'left'
}

/** Interpolate angles the short way round. */
export function lerpAngle(a: number, b: number, k: number) {
  const d = ((b - a + 540) % 360) - 180
  return a + d * k
}

export function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function smoothstep(k: number) {
  const c = clamp(k, 0, 1)
  return c * c * (3 - 2 * c)
}
