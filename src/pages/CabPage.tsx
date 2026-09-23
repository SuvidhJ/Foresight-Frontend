import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Box, Clock, History, MessageSquareText, UserX } from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { Button } from '@/components/ui/button'
import type { AgentAnswer } from '@/contract/types'
import { AlertStrip } from '@/features/alerts/AlertStrip'
import { ConditionsNotice, StopFlash } from '@/features/alerts/SceneOverlays'
import { useAlertEffects } from '@/features/alerts/useAlertEffects'
import { AnswerCard, AskPanel } from '@/features/ask/AskPanel'
import { Banners, ConditionsChip, EtaCard, PushToTalk, StartShiftGate, StatusPanel } from '@/features/cab/CabParts'
import { ReplayDialog } from '@/features/replay/ReplayDialog'
import { SiteView } from '@/features/site/SiteView'
import { SCENARIOS, type ScenarioId } from '@/lib/scenarios'
import { clock } from '@/lib/format'
import { useLevel, useOperatorId } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useLive } from '@/store/live'
import { useSession } from '@/store/session'

function Clock24() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(id)
  }, [])
  return <span className="num">{clock(now)}</span>
}

/** Frame class: soft glow or hard pulse around the whole cab view. */
function useFrameTier() {
  useLive((s) => s.alertKey)
  const a = useLive.getState().cur?.frame.active_alert
  return a && a.tier !== 'log' ? a.tier : null
}

function AwayNote() {
  const away = useLive((s) => !!s.cur && s.cur.frame.machine.engine_on && !s.cur.frame.machine.seat_occupied)
  if (!away) return null
  return (
    <div className="absolute left-4 top-4 z-10 flex max-w-sm items-start gap-3 rounded-lg border border-soft/50 bg-black/70 p-3 text-sm backdrop-blur">
      <UserX className="mt-0.5 size-5 shrink-0 text-soft" />
      <div>
        <div className="font-semibold text-soft">Operator away, engine idling</div>
        <div className="text-muted-foreground">Nobody is in the cab to hear an alert, so this goes to the supervisor view and the next briefing instead.</div>
      </div>
    </div>
  )
}

export default function CabPage() {
  useAlertEffects()
  const tier = useFrameTier()
  const level = useLevel()
  const operator = useOperatorId()
  const { tilted, setTilted } = useSession()
  const scenario = useLive((s) => s.cur?.frame.scenario_id as ScenarioId | undefined)
  const [answer, setAnswer] = useState<AgentAnswer | null>(null)
  const [replay, setReplay] = useState(false)
  useHotkeys('t', () => setTilted(!useSession.getState().tilted))
  useHotkeys('r', () => setReplay(true))

  return (
    <div className="relative flex h-full flex-col overflow-hidden" data-testid="cab" data-tier={tier ?? 'none'}>
      <div className={cn('pointer-events-none absolute inset-0 z-40', tier === 'hard' && 'hard-frame', tier === 'soft' && 'soft-frame')} aria-hidden />
      <StartShiftGate />
      <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-panel px-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-primary"><span className="size-2.5 animate-pulse rounded-full bg-primary" /> LIVE</span>
        <span className="text-sm text-muted-foreground">
          Scenario {scenario ?? '–'}{scenario && SCENARIOS[scenario] ? ` · ${SCENARIOS[scenario].name}` : ''}
        </span>
        <ConditionsChip />
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">EXC001 · {operator} · <span className="capitalize text-foreground">{level}</span></span>
          <span className="flex items-center gap-1.5 text-lg font-semibold"><Clock className="size-4 text-muted-foreground" /><Clock24 /></span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <Banners />
          <AwayNote />
          <SiteView tilted={tilted} />
          <StopFlash />
          <ConditionsNotice />
          <div className="absolute bottom-3 left-3 flex gap-2">
            <Button variant="secondary" size="sm" className="bg-black/60 backdrop-blur" onClick={() => setTilted(!tilted)}>
              <Box className="size-4" /> {tilted ? 'Top-down' : '3D view'} <kbd className="ml-1 text-[10px] text-muted-foreground">T</kbd>
            </Button>
            <Button variant="secondary" size="sm" className="bg-black/60 backdrop-blur" onClick={() => setReplay(true)}>
              <History className="size-4" /> Replay <kbd className="ml-1 text-[10px] text-muted-foreground">R</kbd>
            </Button>
          </div>
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto border-l bg-panel p-3">
          <EtaCard />
          <StatusPanel />
          <PushToTalk onAnswer={setAnswer} />
          <AnimatePresence>{answer && <AnswerCard a={answer} />}</AnimatePresence>
          <AskPanel trigger={<Button variant="outline" className="h-11 w-full"><MessageSquareText className="size-4" /> Ask a question</Button>} />
        </aside>
      </div>

      <AlertStrip />
      <ReplayDialog open={replay} onOpenChange={setReplay} />
    </div>
  )
}
