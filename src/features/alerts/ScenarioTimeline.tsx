import { motion, AnimatePresence } from 'motion/react'
import { SCENARIOS, scenarioLength, type ScenarioId } from '@/lib/scenarios'
import { cn } from '@/lib/utils'
import { useLive } from '@/store/live'

const TONE = { soft: 'bg-soft', hard: 'bg-hard', ok: 'bg-ok', info: 'bg-primary' } as const

/**
 * Presenter aid on the demo stage: the scripted beats of the running scenario, a playhead,
 * and one line on what to watch now. Beat times are the mock simulator's script; with the
 * real M1 the playhead still follows the stream's own clock (LiveFrame.t).
 */
export function ScenarioTimeline() {
  const scenario = useLive((s) => s.cur?.frame.scenario_id as ScenarioId | undefined)
  const t = useLive((s) => Math.round((s.cur?.frame.t ?? 0) * 5) / 5)
  if (!scenario || !SCENARIOS[scenario]) return null
  const { beats } = SCENARIOS[scenario]
  const len = scenarioLength(scenario)
  const now = [...beats].reverse().find((b) => t >= b.t) ?? beats[0]
  const pos = (x: number) => `${Math.min(100, (x / len) * 100)}%`
  return (
    <div className="border-b bg-panel/80 px-4 pb-2.5 pt-2" data-testid="scenario-timeline">
      <div className="relative mt-4 h-1.5 rounded-full bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/40" style={{ width: pos(t) }} />
        {beats.map((b, i) => (
          <div key={b.t} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: pos(b.t) }}>
            <div className={cn('size-3 rounded-full ring-2 ring-background', TONE[b.tone ?? 'info'], t < b.t && 'opacity-40')} />
            {/* the first label starts at its dot, so it isn't cut off at the left edge */}
            <div className={cn('absolute bottom-3.5 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider', i === 0 ? 'left-0' : 'left-1/2 -translate-x-1/2', t >= b.t ? 'text-foreground' : 'text-muted-foreground/60')}>{b.label}</div>
          </div>
        ))}
        <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-white" style={{ left: pos(t) }} />
      </div>
      <div className="mt-2 flex items-start gap-3">
        <span className="num mt-0.5 w-12 shrink-0 text-xs text-muted-foreground">{t.toFixed(1)} s</span>
        <AnimatePresence mode="wait">
          <motion.p key={now.t} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm leading-snug">
            {now.say}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}
