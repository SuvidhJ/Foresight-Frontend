/**
 * MSW handlers, grouped by the module that owns each endpoint (doc 05). main.tsx loads only
 * the groups listed in VITE_MOCK, so each teammate's module can go live on its own.
 */
import { http, HttpResponse, ws, type RequestHandler, type WebSocketHandler } from 'msw'
import type { AckRequest, ManualReport, Task, WhatIfRequest } from '@/contract/types'
import {
  AGENT_ANSWERS, AGENT_FALLBACK, BRIEFING_LINES, CHANGED_SINCE_LAST, EVIDENCE_ANALYTICS, EVIDENCE_SAFETY, FLAGS, FORECAST,
  HANDOVER, LESSONS, OPERATORS, PLAN, SKILL, SLOTS, SUMMARY, TASKS, TIPS, TRAINER_ROWS, precheckItems,
} from './fixtures'
import { append, mock, restore, startScenario, tamper, tick, verify } from './state'
import type { ScenarioId } from './sim'

type Handler = RequestHandler | WebSocketHandler

// The `ws://*/…` wildcard does not match a host with a port; a regular expression does.
const live = ws.link(/\/ws\/live$/)

const m1: Handler[] = [
  live.addEventListener('connection', ({ client }) => {
    const id = setInterval(() => client.send(JSON.stringify(tick())), 100)
    client.addEventListener('close', () => clearInterval(id))
  }),
  http.post('/api/scenarios/:id/start', ({ params }) => {
    startScenario(String(params.id) as ScenarioId)
    return HttpResponse.json({ ok: true })
  }),
  http.post('/api/alerts/:id/ack', async ({ request }) => {
    const req = (await request.json()) as AckRequest
    mock.acks.push(req)
    if (req.action === 'dismiss') {
      // Soft alerts only: M1 ignores dismissals of hard alerts.
      const a = tick().active_alert
      if (a && a.tier === 'soft' && a.alert_id === req.alert_id) {
        mock.ctx.dismissed.add(req.alert_id)
        append({ ...a, source: 'operator', reasons: [...a.reasons, `Dismissed: ${req.reason_code ?? 'no reason'}`] }, 'dismissed', `Reason: ${req.reason_code}`)
      }
    }
    return HttpResponse.json({ ok: true })
  }),
  http.get('/api/evidence/safety', () => HttpResponse.json(EVIDENCE_SAFETY)),
]

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function whatIf(r: WhatIfRequest): Task[] {
  return TASKS.map((t) => {
    const rain = 1 + 0.02 * r.rain_mm_h * (t.type === 'trenching' ? 1.5 : 1)
    const vis = r.visibility_m < 100 ? 1.12 : r.visibility_m < 500 ? 1.05 : 1
    const trucks = t.type === 'truck_loading' ? 1 + 0.18 * Math.max(0, 3 - r.trucks_available) : 1
    const k = rain * vis * trucks
    const spread = 1 + 0.25 * (k - 1) + 0.04 * r.rain_mm_h
    const p50 = t.p50_min * k
    const cond = t.eta_breakdown[1].minutes + (p50 - t.p50_min)
    return {
      ...t,
      p50_min: +p50.toFixed(1),
      p10_min: +(p50 - (t.p50_min - t.p10_min) * spread).toFixed(1),
      p90_min: +(p50 + (t.p90_min - t.p50_min) * spread).toFixed(1),
      eta_breakdown: [t.eta_breakdown[0], { ...t.eta_breakdown[1], minutes: +cond.toFixed(1) }, t.eta_breakdown[2]],
    }
  })
}

const op = (url: string) => new URL(url).searchParams.get('operator') ?? 'OP1001'

const m2: Handler[] = [
  http.get('/api/incidents', async () => {
    await mock.chain
    return HttpResponse.json(mock.incidents)
  }),
  http.post('/api/incidents', async ({ request }) => {
    const r = (await request.json()) as ManualReport
    const last = tick()
    await append({
      alert_id: `M-${Date.now()}`, t: Date.now() / 1000, machine_id: r.machine_id, operator_id: r.operator_id,
      tier: r.type === 'emergency' ? 'hard' : 'log', type: r.type, source: 'operator',
      reasons: [`${r.category.replace('_', ' ')} reported by the operator`], action: r.type === 'emergency' ? 'Supervisor alerted' : 'Logged for review',
      conditions: last.conditions,
    }, r.category === 'near_miss' ? 'near_miss' : r.category === 'incident' ? 'incident' : null, r.note || null)
    return HttpResponse.json(mock.incidents.at(-1))
  }),
  http.get('/api/incidents/verify', async () => HttpResponse.json(await verify())),
  http.post('/api/demo/tamper/:seq', ({ params }) => HttpResponse.json({ ok: tamper(Number(params.seq)) })),
  http.post('/api/demo/restore', () => HttpResponse.json({ ok: restore() })),
  http.get('/api/tasks', () => HttpResponse.json(TASKS)),
  http.get('/api/tasks/plan', () => HttpResponse.json(PLAN)),
  http.post('/api/eta/whatif', async ({ request }) => {
    await delay(120)
    return HttpResponse.json(whatIf((await request.json()) as WhatIfRequest))
  }),
  http.get('/api/forecast', () => HttpResponse.json(FORECAST)),
  http.get('/api/operators', () => HttpResponse.json(OPERATORS)),
  http.get('/api/operators/:id/anomalies', ({ params }) => HttpResponse.json(FLAGS[String(params.id)] ?? [])),
  http.get('/api/operators/:id/skill', ({ params }) => HttpResponse.json(SKILL[String(params.id)] ?? SKILL.OP1001)),
  http.get('/api/shift/summary', ({ request }) => HttpResponse.json(SUMMARY[op(request.url)] ?? SUMMARY.OP1001)),
  http.get('/api/evidence/analytics', () => HttpResponse.json(EVIDENCE_ANALYTICS)),
]

const training = { booked: new Set<string>(), scores: new Map<string, number>(), feedback: new Map<string, 'up' | 'down'>() }

const m4: Handler[] = [
  http.get('/api/training/trainer/overview', () => HttpResponse.json(TRAINER_ROWS)),
  http.get('/api/training/:op', ({ params }) => {
    const id = String(params.op)
    const flags = FLAGS[id] ?? []
    const level = SKILL[id]?.levels.trenching ?? 'standard'
    const assigned = LESSONS.filter((l) => flags.some((f) => l.trigger_rules.includes(f.rule))).map((l) => {
      const f = flags.find((x) => l.trigger_rules.includes(x.rule))!
      return { lesson_id: l.lesson_id, because_flag_id: f.flag_id, because: f.reason, done: training.scores.has(`${id}:${l.lesson_id}`), score: training.scores.get(`${id}:${l.lesson_id}`) ?? null }
    })
    return HttpResponse.json({
      operator_id: id,
      assigned,
      lessons: LESSONS,
      slots: SLOTS.map((s) => ({ ...s, booked: training.booked.has(`${id}:${s.slot_id}`) })),
      tips: TIPS.filter((t) => level === 'expert' ? t.level === 'expert' : t.level !== 'expert').map((t) => ({ ...t, feedback: training.feedback.get(t.tip_id) ?? null })),
    })
  }),
  http.post('/api/training/quiz', async ({ request }) => {
    const b = (await request.json()) as { operator_id: string; lesson_id: string; answers: number[] }
    const lesson = LESSONS.find((l) => l.lesson_id === b.lesson_id)!
    const correct = lesson.quiz.map((q, i) => q.answer_idx === b.answers[i])
    const score = correct.filter(Boolean).length
    training.scores.set(`${b.operator_id}:${b.lesson_id}`, score)
    return HttpResponse.json({ score, correct })
  }),
  http.post('/api/training/booking', async ({ request }) => {
    const b = (await request.json()) as { operator_id: string; slot_id: string }
    training.booked.add(`${b.operator_id}:${b.slot_id}`)
    return HttpResponse.json({ ok: true })
  }),
  http.post('/api/tips/:id/feedback', async ({ params, request }) => {
    training.feedback.set(String(params.id), ((await request.json()) as { feedback: 'up' | 'down' }).feedback)
    return HttpResponse.json({ ok: true })
  }),
  http.get('/api/precheck', ({ request }) => {
    const id = op(request.url)
    const level = OPERATORS.find((o) => o.operator_id === id)?.level ?? 'standard'
    return HttpResponse.json({
      items: precheckItems(level, 14),
      briefing: {
        operator_id: id, level, lines: BRIEFING_LINES[level], changed_since_last: CHANGED_SINCE_LAST,
        handover_note: HANDOVER, yesterday_tip: TIPS[1].text, compliance_streak_shifts: id === 'OP1001' ? 3 : 11,
      },
    })
  }),
  http.post('/api/precheck', () => HttpResponse.json({ ok: true })),
  http.post('/api/voice', async () => {
    await delay(600)
    const a = AGENT_ANSWERS[2].answer
    return HttpResponse.json({ ...a, transcript: 'how long left' })
  }),
  http.post('/api/agent/ask', async ({ request }) => {
    const { question } = (await request.json()) as { question: string }
    await delay(900)
    return HttpResponse.json(AGENT_ANSWERS.find((a) => a.match.test(question))?.answer ?? AGENT_FALLBACK)
  }),
  http.post('/api/handover', () => HttpResponse.json({ ok: true })),
]

export const handlerGroups = { m1, m2, m4 }
