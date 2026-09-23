/**
 * The 10 Hz live stream. Frames go into this store; the 3D scene reads it with getState()
 * inside useFrame, so React only re-renders the few widgets that subscribe to slices.
 */
import { create } from 'zustand'
import type { LiveFrame, Tier } from '@/contract/types'
import { liveSocketUrl } from '@/lib/api'

export interface Stamped {
  frame: LiveFrame
  at: number // performance.now() when received
}

export interface AlertMark {
  alert_id: string
  tier: Tier
  t: number // scenario seconds when first seen
  scenario_id: string
}

const HISTORY_S = 30
const HISTORY_N = HISTORY_S * 10

interface Live {
  prev: Stamped | null
  cur: Stamped | null
  connected: boolean
  lastAt: number
  latency: number[]
  history: Stamped[]
  marks: AlertMark[]
  /** Alert currently on screen (id + tier); updated only when it changes, so subscribers stay cheap. */
  alertKey: string
  push: (f: LiveFrame) => void
  setConnected: (c: boolean) => void
  resetHistory: () => void
}

export const useLive = create<Live>((set, get) => ({
  prev: null,
  cur: null,
  connected: false,
  lastAt: 0,
  latency: [],
  history: [],
  marks: [],
  alertKey: '',
  push: (frame) => {
    const at = performance.now()
    const s = get()
    const stamped = { frame, at }
    const history = s.history.length >= HISTORY_N ? [...s.history.slice(1), stamped] : [...s.history, stamped]
    const latency = frame.sent_ms ? [...s.latency.slice(-199), Date.now() - frame.sent_ms] : s.latency
    const a = frame.active_alert
    const alertKey = a ? `${a.alert_id}:${a.tier}` : ''
    let marks = s.marks
    if (a && !s.marks.some((m) => m.alert_id === a.alert_id && m.scenario_id === frame.scenario_id && m.t <= frame.t)) {
      marks = [...s.marks.slice(-20), { alert_id: a.alert_id, tier: a.tier, t: frame.t, scenario_id: frame.scenario_id }]
    }
    // A new scenario restarts t: drop the old history so replay covers one run.
    const restarted = s.cur && (frame.scenario_id !== s.cur.frame.scenario_id || frame.t + 0.5 < s.cur.frame.t)
    set({
      prev: restarted ? null : s.cur,
      cur: stamped,
      lastAt: at,
      latency,
      history: restarted ? [stamped] : history,
      marks: restarted ? (a ? [{ alert_id: a.alert_id, tier: a.tier, t: frame.t, scenario_id: frame.scenario_id }] : []) : marks,
      alertKey: alertKey === s.alertKey ? s.alertKey : alertKey,
    })
  },
  setConnected: (connected) => set({ connected }),
  resetHistory: () => set({ history: [], marks: [] }),
}))

let socket: WebSocket | null = null
let retry: ReturnType<typeof setTimeout> | null = null

/** Opens the live socket once for the whole app and reconnects every second if it drops. */
export function connectLive() {
  if (socket && socket.readyState <= 1) return
  try {
    socket = new WebSocket(liveSocketUrl())
  } catch {
    retry = setTimeout(connectLive, 1000)
    return
  }
  socket.onopen = () => useLive.getState().setConnected(true)
  socket.onmessage = (e) => {
    try {
      useLive.getState().push(JSON.parse(e.data as string) as LiveFrame)
    } catch {
      /* ignore malformed frame */
    }
  }
  socket.onclose = () => {
    useLive.getState().setConnected(false)
    if (retry) clearTimeout(retry)
    retry = setTimeout(connectLive, 1000)
  }
}

/** Median and 95th percentile of tick-to-screen latency, in ms. */
export function latencyStats(samples: number[]) {
  if (!samples.length) return null
  const s = [...samples].sort((a, b) => a - b)
  return { p50: s[Math.floor(s.length * 0.5)], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], n: s.length }
}
