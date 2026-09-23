/**
 * What the operator hears. The words adapt to skill level; the alert, its tier and its
 * thresholds never do. Reasons shown on screen come from the alert itself, never from here.
 */
import type { AlertEvent, Level, LiveFrame } from '@/contract/types'
import { bearingOf, relativeSide } from './geo'

const TYPE_NOUN: Record<string, string> = {
  proximity: 'person', stability: 'load', seatbelt: 'seatbelt', seatbelt_bypass: 'seatbelt', stale_sensor: 'detection',
}

function subject(a: AlertEvent, f: LiveFrame | null) {
  const o = f?.objects.find((x) => x.id === a.object_id)
  if (!o || !f) return { what: TYPE_NOUN[a.type] ?? 'hazard', side: null as string | null }
  const b = bearingOf(o.x - f.machine.x, o.y - f.machine.y)
  const side = relativeSide(b, f.machine.swing_deg)
  return { what: o.cls === 'person' ? 'person' : o.cls === 'vehicle' ? 'vehicle' : 'object', side }
}

export function spokenAlert(a: AlertEvent, f: LiveFrame | null, level: Level) {
  const { what, side } = subject(a, f)
  const secs = a.t_cpa_s != null ? Math.max(1, Math.round(a.t_cpa_s)) : null
  const where = side ? (side === 'ahead' ? 'ahead' : side === 'behind' ? 'behind you' : `on your ${side}`) : ''

  if (a.tier === 'hard') {
    if (a.type === 'proximity') return `Stop. ${what === 'person' ? 'Person' : 'Vehicle'} in the swing path.`
    if (a.type === 'stability') return 'Stop. Stability limit.'
    if (a.type === 'seatbelt') return 'Stop. Seatbelt.'
    return 'Stop.'
  }

  if (a.type === 'proximity') {
    if (level === 'expert') return `${secs ? `${secs} seconds, ` : ''}${what}${side ? `, ${side}` : ''}.`
    if (level === 'standard') return `${capital(what)} ${where}${secs ? `, ${secs} seconds` : ''}.`
    return `Caution. A ${what} is approaching ${where}. Closest in ${secs ?? 'a few'} seconds. ${a.action}`
  }
  if (a.type === 'seatbelt') return level === 'guided' ? 'Please buckle up before operating.' : 'Buckle up.'
  if (a.type === 'stability') {
    const ratio = f ? Math.round(f.machine.stability_ratio * 100) : null
    return level === 'expert' && ratio != null ? `Stability ${ratio} percent.` : 'Load near the stability limit. Bring it closer before swinging.'
  }
  if (a.type === 'stale_sensor') return 'Detection degraded. Area not confirmed clear.'
  return a.action
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
