import type { LiveFrame, TrackedObject } from '@/contract/types'
import { clamp, lerp, lerpAngle } from '@/lib/geo'
import { useLive } from '@/store/live'

/** Supplies the two frames to draw between and how far along we are (0–1). */
export type FrameSource = () => { prev: LiveFrame | null; cur: LiveFrame | null; k: number }

/** Live: draw 100 ms behind the newest frame, interpolating, so 10 Hz data moves at 60 fps. */
export const liveSource: FrameSource = () => {
  const s = useLive.getState()
  if (!s.cur) return { prev: null, cur: null, k: 1 }
  if (!s.prev) return { prev: null, cur: s.cur.frame, k: 1 }
  const span = Math.max(40, s.cur.at - s.prev.at)
  return { prev: s.prev.frame, cur: s.cur.frame, k: clamp((performance.now() - s.cur.at) / span, 0, 1) }
}

export function interpolate(prev: LiveFrame | null, cur: LiveFrame, k: number): LiveFrame {
  if (!prev || prev.scenario_id !== cur.scenario_id) return cur
  const pm = prev.machine
  const cm = cur.machine
  const prevObjs = new Map(prev.objects.map((o) => [o.id, o]))
  const objects: TrackedObject[] = cur.objects.map((o) => {
    const p = prevObjs.get(o.id)
    return p ? { ...o, x: lerp(p.x, o.x, k), y: lerp(p.y, o.y, k) } : o
  })
  return {
    ...cur,
    machine: {
      ...cm,
      x: lerp(pm.x, cm.x, k),
      y: lerp(pm.y, cm.y, k),
      heading_deg: lerpAngle(pm.heading_deg, cm.heading_deg, k),
      swing_deg: lerpAngle(pm.swing_deg, cm.swing_deg, k),
      boom_reach_m: lerp(pm.boom_reach_m, cm.boom_reach_m, k),
    },
    zones: {
      inner_m: lerp(prev.zones.inner_m, cur.zones.inner_m, k),
      warn_m: lerp(prev.zones.warn_m, cur.zones.warn_m, k),
      outer_m: lerp(prev.zones.outer_m, cur.zones.outer_m, k),
    },
    conditions: { ...cur.conditions, visibility_m: lerp(prev.conditions.visibility_m, cur.conditions.visibility_m, k) },
    objects,
  }
}
