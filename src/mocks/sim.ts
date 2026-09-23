/**
 * Deterministic stand-in for M1's simulator, used only while M1 is mocked.
 * Each scenario is a pure function of t (seconds since start) plus the operator's
 * dismissals, so the same run always looks the same.
 *
 * Scenario 2 timing matches the demo script: soft warning at 5.2 s, inner-zone
 * breach at 10.0 s, so the operator was warned 4.8 s before the breach.
 */
import type { AlertEvent, Conditions, LiveFrame, MachineState, TrackedObject, Zones } from '@/contract/types'
import { bearingOf, clamp, cpa, lerp, smoothstep } from '@/lib/geo'

export type { ScenarioId } from '@/lib/scenarios'
import type { ScenarioId } from '@/lib/scenarios'

const DRY: Conditions = { ground: 'dry', mu: 0.7, visibility_m: 2000, rain_mm_h: 0, temp_c: 31, humidity_pct: 55, heat_index_c: 34 }
const WET: Conditions = { ground: 'wet', mu: 0.4, visibility_m: 40, rain_mm_h: 6, temp_c: 24, humidity_pct: 92, heat_index_c: 24 }
const ZONES: Zones = { inner_m: 3, warn_m: 6, outer_m: 9 }

export interface SimContext {
  scenario: ScenarioId
  startMs: number
  dismissed: Set<string>
}

/** Dig at `dig` bearing, swing to `dig + delta`, dump, swing back. 14 s cycle. */
function swingCycle(t: number, dig: number, delta: number) {
  const c = ((t % 14) + 14) % 14
  let k = 0
  let phase: 'dig' | 'to_dump' | 'dump' | 'return' = 'dig'
  if (c < 4) { k = 0; phase = 'dig' }
  else if (c < 8) { k = smoothstep((c - 4) / 4); phase = 'to_dump' }
  else if (c < 10) { k = 1; phase = 'dump' }
  else { k = 1 - smoothstep((c - 10) / 4); phase = 'return' }
  const deg = (dig + delta * k + 360) % 360
  // numerical derivative for the rate
  const k2 = c < 4 ? 0 : c < 8 ? smoothstep((c + 0.05 - 4) / 4) : c < 10 ? 1 : 1 - smoothstep((c + 0.05 - 10) / 4)
  const rate = (delta * (k2 - k)) / 0.05
  return { deg, rate, phase, loaded: phase === 'to_dump' || phase === 'dump' }
}

function machine(t: number, o: Partial<MachineState> & { swing: ReturnType<typeof swingCycle> | null }): MachineState {
  const s = o.swing
  const loaded = s?.loaded ?? false
  const reach = s ? (s.phase === 'dig' ? 7.6 : 6.4) : 5.5
  return {
    machine_id: 'EXC001',
    operator_id: o.operator_id ?? 'OP1001',
    x: 0,
    y: 0,
    heading_deg: 0,
    speed_mps: 0,
    swing_deg: s?.deg ?? 0,
    swing_rate_dps: s?.rate ?? 0,
    boom_reach_m: reach,
    load_t: loaded ? 1.8 : 0,
    slope_deg: 2,
    stability_ratio: +(0.32 + (loaded ? 0.22 : 0) + (reach - 6) * 0.04).toFixed(2),
    engine_on: true,
    belt_fastened: true,
    seat_occupied: true,
    hydraulic_lockout: false,
    motion_commanded: s != null,
    fuel_pct: +(14 - t * 0.002).toFixed(1),
    ...o,
  } as MachineState
}

function track(id: string, cls: TrackedObject['cls'], x: number, y: number, vx: number, vy: number): TrackedObject {
  const c = cpa(x, y, vx, vy)
  const moving = Math.hypot(vx, vy) > 0.05
  return {
    id, cls, x, y, vx, vy,
    t_cpa_s: c.t != null && c.t < 30 ? +c.t.toFixed(2) : null,
    d_cpa_m: c.t != null && c.t < 30 ? +c.d.toFixed(2) : null,
    predicted_path: moving ? [0, 1, 2, 3, 4, 5].map((s) => [+(x + vx * s).toFixed(2), +(y + vy * s).toFixed(2)] as [number, number]) : [],
  }
}

function alert(ctx: SimContext, t: number, a: Omit<AlertEvent, 't' | 'machine_id' | 'operator_id' | 'model_version' | 'conditions'>, cond: Conditions): AlertEvent {
  return {
    ...a,
    conditions: cond,
    t: +(ctx.startMs / 1000 + t).toFixed(1),
    machine_id: 'EXC001',
    operator_id: 'OP1001',
    model_version: a.source === 'model' ? 'nearmiss-gbt-0.3' : null,
  }
}

function side(x: number, y: number) {
  const b = bearingOf(x, y)
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(b / 45) % 8]
}

export function frameAt(ctx: SimContext, t: number): LiveFrame {
  const base = {
    t: +t.toFixed(1),
    scenario_id: ctx.scenario,
    seed: 42,
    sensor_ok: true,
    sent_ms: Date.now(),
    shift_start_iso: new Date(ctx.startMs).toISOString(),
    motion_inhibit: false,
  }

  if (ctx.scenario === '1') {
    const worker = track('P7', 'person', -17 + Math.sin(t / 6) * 1.5, 13 + t * 0.15, 0.25 * Math.cos(t / 6), 0.15)
    return {
      ...base,
      machine: machine(t, { swing: swingCycle(t, 0, 110) }),
      objects: [track('V2', 'vehicle', 7.5, -2.7, 0, 0), worker],
      zones: ZONES,
      conditions: DRY,
      active_alert: null,
    }
  }

  if (ctx.scenario === '2') {
    // Worker walks east along y = 1.5 into the swing path, stops, then walks back out.
    const SOFT = 5.2, BREACH = 10.0, STOP = 10.6, TURN = 12.5, CLEAR = 13.1
    let px: number, vx: number
    if (t < STOP) { px = -16 + 1.3 * t; vx = 1.3 }
    else if (t < TURN) { px = -16 + 1.3 * STOP; vx = 0 }
    else { px = -16 + 1.3 * STOP - 1.3 * (t - TURN); vx = -1.3 }
    const inhibit = t >= BREACH && t < CLEAR
    const active = t < BREACH ? t : t < CLEAR ? BREACH : t - (CLEAR - BREACH)
    const m = machine(t, { swing: swingCycle(active + 9.5, 0, -110) })
    if (inhibit) { m.swing_rate_dps = 0; m.motion_commanded = false }
    const person = track('P1', 'person', px, 1.5, vx, 0)
    const cond = DRY
    let active_alert: AlertEvent | null = null
    if (t >= BREACH && t < CLEAR) {
      active_alert = alert(ctx, BREACH, {
        alert_id: 'S2-HARD', tier: 'hard', type: 'proximity', source: 'rule', object_id: 'P1',
        p_nearmiss: null, t_cpa_s: person.t_cpa_s, d_cpa_m: person.d_cpa_m, warning_time_s: +(BREACH - SOFT).toFixed(1),
        reasons: ['Person inside the 3 m inner zone', 'Swing commanded towards the person'],
        action: 'Stop. Motion inhibited until the person is clear of the inner zone.',
      }, cond)
    } else if (t >= SOFT && t < BREACH && !ctx.dismissed.has('S2-SOFT')) {
      active_alert = alert(ctx, SOFT, {
        alert_id: 'S2-SOFT', tier: 'soft', type: 'proximity', source: 'model', object_id: 'P1',
        p_nearmiss: 0.62, t_cpa_s: person.t_cpa_s, d_cpa_m: person.d_cpa_m,
        reasons: [`Person closing from the ${side(px, 1.5)} at 1.3 m/s`, `Closest approach ${person.d_cpa_m?.toFixed(1)} m`, 'Swing arc reaches that bearing within 5 s'],
        action: 'Hold the swing and make eye contact before continuing.',
      }, cond)
    }
    return {
      ...base,
      machine: m,
      motion_inhibit: inhibit,
      objects: [track('V2', 'vehicle', -8.0, -2.9, 0, 0), person],
      zones: ZONES,
      conditions: cond,
      active_alert,
    }
  }

  if (ctx.scenario === '3') {
    // Rain and fog roll in over 1–6 s; zones widen by 30% as friction drops.
    const k = smoothstep((t - 1) / 5)
    const cond: Conditions = {
      ground: k > 0.5 ? 'wet' : 'dry',
      mu: +lerp(DRY.mu, WET.mu, k).toFixed(2),
      visibility_m: Math.round(lerp(DRY.visibility_m, WET.visibility_m, Math.pow(k, 0.35))),
      rain_mm_h: +lerp(0, WET.rain_mm_h, k).toFixed(1),
      temp_c: +lerp(DRY.temp_c, WET.temp_c, k).toFixed(1),
      humidity_pct: Math.round(lerp(DRY.humidity_pct, WET.humidity_pct, k)),
      heat_index_c: +lerp(DRY.heat_index_c!, WET.heat_index_c!, k).toFixed(1),
    }
    const g = 1 + 0.3 * k
    const zones: Zones = { inner_m: +(3 * g).toFixed(2), warn_m: +(6 * g).toFixed(2), outer_m: +(9 * g).toFixed(2) }
    // Light vehicle converges from the south-east, then stops once it sees the machine.
    // At the soft alert (6.5 s) it is ~22 m out: with 40 m visibility only ~20% contrast is left
    // (exp(-3d/V)), so the operator can barely see it. It stops ~13 m out, outside the widened zones.
    const STOP = 12
    const tt = Math.min(t, STOP)
    const vx = t < STOP ? -1.2 : 0, vy = t < STOP ? 1.0 : 0
    const car = track('V9', 'vehicle', 24 - 1.2 * tt, -21 + 1.0 * tt, vx, vy)
    let active_alert: AlertEvent | null = null
    if (t >= 6.5 && t < STOP && !ctx.dismissed.has('S3-SOFT')) {
      active_alert = alert(ctx, 6.5, {
        alert_id: 'S3-SOFT', tier: 'soft', type: 'proximity', source: 'model', object_id: 'V9',
        p_nearmiss: 0.48, t_cpa_s: car.t_cpa_s, d_cpa_m: car.d_cpa_m,
        reasons: ['Light vehicle converging from the south-east', 'Wet ground: stopping distance up about 75%', 'Visibility 40 m'],
        action: 'Slow the swing and sound the horn; keep the bucket low.',
      }, cond)
    }
    return {
      ...base,
      machine: machine(t, { swing: swingCycle(t, 0, 110) }),
      objects: [track('V2', 'vehicle', 7.5, -2.7, 0, 0), car],
      zones,
      conditions: cond,
      active_alert,
    }
  }

  // Scenario 4: the brief's rows 2 and 4 replayed. Engine on, lockout down, belt off, seat empty.
  // Nothing sounds in the cab: nobody is there. The supervisor view gets the unattended-idle entry.
  const m = machine(t, { swing: null })
  Object.assign(m, { belt_fastened: false, seat_occupied: false, hydraulic_lockout: true, motion_commanded: false, boom_reach_m: 5.2 })
  return {
    ...base,
    machine: m,
    objects: [track('V2', 'vehicle', 7.5, -2.7, 0, 0)],
    zones: ZONES,
    conditions: { ...DRY, temp_c: 33, heat_index_c: 37 },
    active_alert: null,
  }
}

/** Events the log should record at time t (M2 writes these in the real system). */
export function loggedEventsAt(ctx: SimContext, t: number): AlertEvent[] {
  if (ctx.scenario !== '4') return []
  const cond = { ...DRY, temp_c: 33, heat_index_c: 37 }
  const out: AlertEvent[] = []
  if (t >= 4) out.push(alert(ctx, 4, {
    alert_id: 'S4-ROW2', tier: 'log', type: 'unattended_idle', source: 'rule', reasons: [
      'Brief row 2 (10:00): idle 55 of 60 min, belt unfastened, 2 load cycles',
      'Engine on with hydraulic lockout down and seat empty',
    ], action: 'Supervisor: check on the machine; engine idle shutdown would have saved about 1.8 L',
  }, cond))
  if (t >= 9) out.push(alert(ctx, 9, {
    alert_id: 'S4-ROW4', tier: 'log', type: 'unattended_idle', source: 'rule', reasons: [
      'Brief row 4 (09:00 next day): idle 60 of 60 min, belt unfastened, 1 load cycle',
      'Same pattern as row 2: repeat flag',
    ], action: 'Supervisor: repeat pattern; seatbelt and idle lesson assigned',
  }, cond))
  return out
}

export const clampT = (t: number) => clamp(t, 0, 3600)
