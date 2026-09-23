import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Box, UserX } from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/ui/button'
import { AlertStrip } from '@/features/alerts/AlertStrip'
import { ScenarioTimeline } from '@/features/alerts/ScenarioTimeline'
import { ConditionsNotice, StopFlash } from '@/features/alerts/SceneOverlays'
import { useAlertEffects } from '@/features/alerts/useAlertEffects'
import { Banners, ConditionsChip, StartShiftGate } from '@/features/cab/CabParts'
import { ChainStrip, IntegrityBadge } from '@/features/incidents/IntegrityBadge'
import { SiteView } from '@/features/site/SiteView'
import { clockSec, titleCase } from '@/lib/format'
import { useIncidents, useVerify } from '@/lib/queries'
import { SCENARIOS, type ScenarioId } from '@/lib/scenarios'
import { cn } from '@/lib/utils'
import { useLive } from '@/store/live'
import { TamperControls, TierIcon } from '@/features/incidents/controls'

/**
 * Demo stage: the cab tablet and the supervisor's log side by side, so the judges see an
 * alert fire and its tamper-evident record appear, with its warning time, in one shot.
 */
export default function StagePage() {
  useAlertEffects()
  // The stage opens in 3D: it is what the panel watches. T flips to the operator's top-down view.
  const [tilted, setTilted] = useState(true)
  useHotkeys('t', () => setTilted((v) => !v))
  useLive((s) => s.alertKey)
  const a = useLive.getState().cur?.frame.active_alert
  const tier = a && a.tier !== 'log' ? a.tier : null
  const scenario = useLive((s) => s.cur?.frame.scenario_id as ScenarioId | undefined)
  const incidents = useIncidents(1000).data ?? []
  const verify = useVerify(2000).data
  const recent = [...incidents].reverse().slice(0, 9)
  const away = useLive((s) => !!s.cur && s.cur.frame.machine.engine_on && !s.cur.frame.machine.seat_occupied)

  return (
    <div className="relative grid h-full grid-cols-1 gap-4 p-4 xl:grid-cols-[1fr_440px]">
      <StartShiftGate mode="stage" />
      <section className="relative flex min-h-[520px] flex-col overflow-hidden rounded-2xl border-[6px] border-[#1b232d] bg-background shadow-2xl" aria-label="Cab tablet">
        <div className={cn('pointer-events-none absolute inset-0 z-40', tier === 'hard' && 'hard-frame', tier === 'soft' && 'soft-frame')} />
        <div className="flex h-11 items-center gap-3 border-b bg-panel px-3 text-sm">
          <span className="flex items-center gap-2 font-semibold text-primary"><span className="size-2 animate-pulse rounded-full bg-primary" /> CAB · EXC001</span>
          <span className="text-muted-foreground">{scenario ? `Scenario ${scenario} · ${SCENARIOS[scenario].name}` : 'Press 1–4 to run a scenario'}</span>
          <div className="ml-auto"><ConditionsChip /></div>
        </div>
        <ScenarioTimeline />
        <div className="relative min-h-0 flex-1">
          <Banners />
          <SiteView tilted={tilted} />
          <StopFlash />
          <ConditionsNotice />
          <Button variant="secondary" size="sm" className="absolute bottom-3 left-3 bg-black/60 backdrop-blur" onClick={() => setTilted(!tilted)}>
            <Box className="size-4" /> {tilted ? 'Top-down' : '3D view'} <kbd className="ml-1 text-[10px] text-muted-foreground">T</kbd>
          </Button>
        </div>
        <AlertStrip compact />
      </section>

      <section className="flex min-h-0 flex-col gap-3" aria-label="Supervisor view">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Supervisor · incident log</h2>
          <TamperControls />
        </div>
        <IntegrityBadge v={verify} />
        <div className="rounded-xl border bg-card p-2"><ChainStrip records={incidents} brokenAt={verify && !verify.ok ? verify.first_broken_seq : null} /></div>
        <AnimatePresence>
          {away && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-3 rounded-xl border border-soft/50 bg-soft/10 p-3 text-sm">
              <UserX className="mt-0.5 size-5 text-soft" />
              <div><div className="font-semibold">EXC001 unattended: engine idling, belt off, seat empty</div><div className="text-muted-foreground">Routed here, not to the empty cab.</div></div>
            </motion.div>
          )}
        </AnimatePresence>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto" data-testid="stage-feed">
          <AnimatePresence initial={false}>
            {recent.map((r) => {
              const broken = verify && !verify.ok && verify.first_broken_seq != null && r.seq >= verify.first_broken_seq
              return (
                <motion.li
                  key={r.seq}
                  layout
                  initial={{ opacity: 0, x: 24, backgroundColor: 'rgba(34,211,238,0.2)' }}
                  animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(16,22,30,1)' }}
                  transition={{ duration: 0.6 }}
                  className={cn('rounded-xl border p-3', broken && 'border-hard')}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <TierIcon tier={r.event.tier} />
                    <span className="font-medium">{titleCase(r.event.type)}</span>
                    <span className="text-xs uppercase text-muted-foreground">{r.event.source}</span>
                    <span className="num ml-auto text-xs text-muted-foreground">#{r.seq} · {clockSec(new Date(r.event.t * 1000))}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.event.reasons.join(' · ')}</div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    {r.event.warning_time_s != null && <span className="num rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">warned {r.event.warning_time_s.toFixed(1)} s before breach</span>}
                    {r.outcome && <span className="text-muted-foreground">{titleCase(r.outcome)}</span>}
                    <span className={cn('num ml-auto', broken ? 'text-hard' : 'text-muted-foreground')}>{r.hash.slice(0, 10)}…</span>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      </section>
    </div>
  )
}
