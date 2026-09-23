/**
 * The only place the frontend talks to the backend (doc 05: one api.ts).
 * Paths are relative: MSW answers them while a module is mocked, otherwise the Vite
 * dev server forwards them to that module's service (see vite.config.ts).
 * VITE_API_BASE overrides everything, e.g. when the built app is served by the integrated API.
 */
import type {
  AckRequest,
  AgentAnswer,
  AnomalyFlag,
  EvidenceAnalytics,
  EvidenceSafety,
  ForecastHour,
  IncidentRecord,
  ManualReport,
  OperatorSummary,
  PrecheckState,
  ShiftSummary,
  SkillProfile,
  Task,
  TaskPlan,
  TrainerRow,
  TrainingState,
  VerifyResult,
  WhatIfRequest,
} from '@/contract/types'

const BASE: string = import.meta.env.VITE_API_BASE ?? ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} }
  if (body instanceof Blob || body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new ApiError(res.status, `${method} ${path} → ${res.status}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

const get = <T,>(p: string) => request<T>('GET', p)
const post = <T,>(p: string, b?: unknown) => request<T>('POST', p, b)
const q = (o: Record<string, string>) => `?${new URLSearchParams(o)}`

export function liveSocketUrl() {
  const override: string | undefined = import.meta.env.VITE_WS_URL
  if (override) return override
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws/live`
}

export const api = {
  // M1 safety engine
  startScenario: (id: string) => post<{ ok: boolean }>(`/api/scenarios/${id}/start`),
  ack: (req: AckRequest) => post<{ ok: boolean }>(`/api/alerts/${req.alert_id}/ack`, req),
  evidenceSafety: () => get<EvidenceSafety>('/api/evidence/safety'),

  // M2 data and analytics
  incidents: () => get<IncidentRecord[]>('/api/incidents'),
  report: (r: ManualReport) => post<IncidentRecord>('/api/incidents', r),
  verify: () => get<VerifyResult>('/api/incidents/verify'),
  tamper: (seq: number) => post<{ ok: boolean }>(`/api/demo/tamper/${seq}`),
  restore: () => post<{ ok: boolean }>('/api/demo/restore'),
  tasks: (operator: string) => get<Task[]>(`/api/tasks${q({ operator })}`),
  plan: (operator: string) => get<TaskPlan>(`/api/tasks/plan${q({ operator })}`),
  whatIf: (operator: string, r: WhatIfRequest) => post<Task[]>(`/api/eta/whatif${q({ operator })}`, r),
  forecast: () => get<ForecastHour[]>('/api/forecast'),
  operators: () => get<OperatorSummary[]>('/api/operators'),
  anomalies: (operator: string) => get<AnomalyFlag[]>(`/api/operators/${operator}/anomalies`),
  skill: (operator: string) => get<SkillProfile>(`/api/operators/${operator}/skill`),
  summary: (operator: string) => get<ShiftSummary>(`/api/shift/summary${q({ operator })}`),
  evidenceAnalytics: () => get<EvidenceAnalytics>('/api/evidence/analytics'),

  // M4 companion
  training: (operator: string) => get<TrainingState>(`/api/training/${operator}`),
  trainer: () => get<TrainerRow[]>('/api/training/trainer/overview'),
  quiz: (operator: string, lesson_id: string, answers: number[]) =>
    post<{ score: number; correct: boolean[] }>('/api/training/quiz', { operator_id: operator, lesson_id, answers }),
  book: (operator: string, slot_id: string) => post<{ ok: boolean }>('/api/training/booking', { operator_id: operator, slot_id }),
  tipFeedback: (tip_id: string, feedback: 'up' | 'down') => post<{ ok: boolean }>(`/api/tips/${tip_id}/feedback`, { feedback }),
  precheck: (operator: string) => get<PrecheckState>(`/api/precheck${q({ operator })}`),
  submitPrecheck: (operator: string, values: Record<string, boolean>) =>
    post<{ ok: boolean }>('/api/precheck', { operator_id: operator, values }),
  voice: (wav: Blob, operator: string) => {
    const form = new FormData()
    form.append('audio', wav, 'ptt.wav')
    form.append('operator_id', operator)
    return post<AgentAnswer>('/api/voice', form)
  },
  ask: (operator: string, question: string) => post<AgentAnswer>('/api/agent/ask', { operator_id: operator, question }),
  handover: (operator: string, note: string) => post<{ ok: boolean }>('/api/handover', { operator_id: operator, note }),
}
