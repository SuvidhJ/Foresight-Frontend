import { useQuery } from '@tanstack/react-query'
import type { Level } from '@/contract/types'
import { api } from './api'
import { useSession } from '@/store/session'

export const useOperators = () => useQuery({ queryKey: ['operators'], queryFn: api.operators, staleTime: Infinity })

export function useOperatorId() {
  return useSession((s) => s.operatorId)
}

export function useSkill() {
  const id = useOperatorId()
  return useQuery({ queryKey: ['skill', id], queryFn: () => api.skill(id) })
}

export function useTasks() {
  const id = useOperatorId()
  return useQuery({ queryKey: ['tasks', id], queryFn: () => api.tasks(id) })
}

export function usePlan() {
  const id = useOperatorId()
  return useQuery({ queryKey: ['plan', id], queryFn: () => api.plan(id) })
}

export const useForecast = () => useQuery({ queryKey: ['forecast'], queryFn: api.forecast, staleTime: 60_000 })

export const useIncidents = (pollMs = 2000) =>
  useQuery({ queryKey: ['incidents'], queryFn: api.incidents, refetchInterval: pollMs })

export const useVerify = (pollMs = 4000) => useQuery({ queryKey: ['verify'], queryFn: api.verify, refetchInterval: pollMs })

export function useAnomalies(operator?: string) {
  const current = useOperatorId()
  const id = operator ?? current
  return useQuery({ queryKey: ['anomalies', id], queryFn: () => api.anomalies(id) })
}

export function useSummary() {
  const id = useOperatorId()
  return useQuery({ queryKey: ['summary', id], queryFn: () => api.summary(id) })
}

export function useTraining() {
  const id = useOperatorId()
  return useQuery({ queryKey: ['training', id], queryFn: () => api.training(id) })
}

export const useTrainer = () => useQuery({ queryKey: ['trainer'], queryFn: api.trainer })

export function usePrecheck() {
  const id = useOperatorId()
  return useQuery({ queryKey: ['precheck', id], queryFn: () => api.precheck(id) })
}

export const useEvidence = () =>
  useQuery({
    queryKey: ['evidence'],
    queryFn: async () => ({ safety: await api.evidenceSafety(), analytics: await api.evidenceAnalytics() }),
  })

/**
 * The operator's coaching level for the task in hand (computed by M2 per task type).
 * It changes wording and coaching frequency only, never alert thresholds.
 */
export function useLevel(): Level {
  const skill = useSkill().data
  const tasks = useTasks().data
  const ops = useOperators().data
  const id = useOperatorId()
  const active = tasks?.find((t) => t.status === 'active') ?? tasks?.[0]
  return (active && skill?.levels[active.type]) ?? ops?.find((o) => o.operator_id === id)?.level ?? 'standard'
}
