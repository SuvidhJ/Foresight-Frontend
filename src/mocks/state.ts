/**
 * Mutable state behind the mocks: the running scenario and a real hash-chained incident log
 * (h_i = SHA256(h_{i-1} || record_i)), so tamper detection works the same way on mocks.
 */
import type { AlertEvent, IncidentRecord, Outcome, VerifyResult } from '@/contract/types'
import { seedIncidents } from './fixtures'
import { frameAt, loggedEventsAt, type ScenarioId, type SimContext } from './sim'

const GENESIS = '0'.repeat(64)

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Canonical record body: everything except the hash itself. */
function body(r: Omit<IncidentRecord, 'hash'>) {
  return JSON.stringify({ seq: r.seq, event: r.event, outcome: r.outcome ?? null, note: r.note ?? null, prev_hash: r.prev_hash })
}

export const mock = {
  ctx: { scenario: '1', startMs: Date.now(), dismissed: new Set<string>() } as SimContext,
  incidents: [] as IncidentRecord[],
  logged: new Set<string>(),
  acks: [] as { alert_id: string; action: string; reason_code?: string | null }[],
  tampered: null as null | { seq: number; original: IncidentRecord },
  chain: Promise.resolve() as Promise<unknown>,
}

/** Appends are serialised so the chain order is deterministic. */
export function append(event: AlertEvent, outcome: Outcome | null = null, note: string | null = null) {
  mock.chain = mock.chain.then(async () => {
    const prev = mock.incidents.at(-1)
    const rec = { seq: (prev?.seq ?? 0) + 1, event, outcome, note, prev_hash: prev?.hash ?? GENESIS }
    mock.incidents.push({ ...rec, hash: await sha256(rec.prev_hash + body(rec)) })
  })
  return mock.chain
}

export async function verify(): Promise<VerifyResult> {
  await mock.chain
  let prev = GENESIS
  for (const r of mock.incidents) {
    const expect = await sha256(prev + body({ ...r, prev_hash: prev }))
    if (r.prev_hash !== prev || r.hash !== expect) return { ok: false, checked: r.seq, first_broken_seq: r.seq }
    prev = r.hash
  }
  return { ok: true, checked: mock.incidents.length, first_broken_seq: null }
}

/** Demo-only: edit a stored row in place, as an attacker editing the database would. */
export function tamper(seq: number) {
  const i = mock.incidents.findIndex((r) => r.seq === seq)
  if (i < 0) return false
  const original = mock.incidents[i]
  mock.tampered = { seq, original }
  mock.incidents[i] = { ...original, outcome: 'cleared', note: 'edited: warning time removed', event: { ...original.event, warning_time_s: null, tier: 'log' } }
  return true
}

export function restore() {
  if (!mock.tampered) return false
  const i = mock.incidents.findIndex((r) => r.seq === mock.tampered!.seq)
  mock.incidents[i] = mock.tampered.original
  mock.tampered = null
  return true
}

export function startScenario(id: ScenarioId) {
  mock.ctx = { scenario: id, startMs: Date.now(), dismissed: new Set() }
}

export function currentT() {
  return (Date.now() - mock.ctx.startMs) / 1000
}

/** One tick: build the frame and log any alert seen for the first time (M2's sink in the real system). */
export function tick() {
  const t = currentT()
  const frame = frameAt(mock.ctx, t)
  const a = frame.active_alert
  if (a && !mock.logged.has(`${mock.ctx.startMs}:${a.alert_id}`)) {
    mock.logged.add(`${mock.ctx.startMs}:${a.alert_id}`)
    append(a, a.tier === 'hard' ? 'near_miss' : null, a.tier === 'hard' ? `Warned ${a.warning_time_s} s before the breach` : null)
  }
  for (const e of loggedEventsAt(mock.ctx, t)) {
    const key = `${mock.ctx.startMs}:${e.alert_id}`
    if (!mock.logged.has(key)) {
      mock.logged.add(key)
      append(e, null, 'Routed to the supervisor view and the next briefing')
    }
  }
  return frame
}

// Seed the log once, with a valid chain.
for (const r of seedIncidents(Date.now() / 1000)) append(r.event, r.outcome ?? null, r.note ?? null)
