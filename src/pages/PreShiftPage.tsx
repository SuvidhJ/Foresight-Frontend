import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { CheckCheck, Cpu, Eye, History, Lightbulb, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PageHeader, Panel } from '@/components/Stat'
import type { PrecheckItem } from '@/contract/types'
import { api } from '@/lib/api'
import { useLevel, useOperatorId, usePrecheck } from '@/lib/queries'
import { unlockAudio } from '@/lib/sound'
import { cn } from '@/lib/utils'
import { useAudioGate } from '@/store/session'

const GROUPS: { id: PrecheckItem['group']; title: string }[] = [
  { id: 'ppe', title: 'PPE' },
  { id: 'machine', title: 'Machine' },
  { id: 'condition', title: "Today's conditions" },
]

/**
 * Pre-shift: don't ask the operator what the sensors already know. What the checklist asks
 * for depends on the coaching level; the items that matter for safety are the same for all.
 */
export default function PreShiftPage() {
  const operator = useOperatorId()
  const level = useLevel()
  const data = usePrecheck().data
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!data) return
    setValues(Object.fromEntries(data.items.filter((i) => i.auto_filled && i.value != null).map((i) => [i.id, i.value!])))
  }, [data])

  const visual = useMemo(() => data?.items.filter((i) => !i.auto_filled) ?? [], [data])
  const done = visual.every((i) => values[i.id])
  const flaggedSensors = data?.items.filter((i) => i.auto_filled && i.value === false) ?? []

  const confirmItems = (items: PrecheckItem[]) => {
    setValues((v) => ({ ...v, ...Object.fromEntries(items.map((i) => [i.id, true])) }))
    toast(`${items.length} visual ${items.length === 1 ? 'item' : 'items'} confirmed together (logged)`)
  }
  const confirmGroup = () => confirmItems(visual)
  const start = async () => {
    // This click is the user gesture browsers need for sound, so the cab opens ready: no second gate.
    useAudioGate.getState().setUnlocked()
    unlockAudio().catch(() => undefined)
    await api.submitPrecheck(operator, values).catch(() => undefined)
    navigate('/cab')
  }

  if (!data) return <div className="p-8 text-sm text-muted-foreground">Loading pre-shift…</div>
  const b = data.briefing

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="Pre-shift" sub={<>Coaching level <span className="font-medium capitalize text-foreground">{level}</span>. It changes how much you're told, never the safety limits.</>}>
        <Badge variant="outline" className="gap-1.5"><ShieldCheck className="size-3.5 text-ok" /> Belted {b.compliance_streak_shifts} shifts in a row</Badge>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <Panel title="Today's briefing">
            <motion.ul className="space-y-2" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.12 } } }} data-testid="briefing">
              {b.lines.map((l) => (
                <motion.li key={l} variants={{ h: { opacity: 0, y: 6 }, s: { opacity: 1, y: 0 } }} className={cn('leading-relaxed', level === 'expert' ? 'num text-base' : 'text-base')}>{l}</motion.li>
              ))}
            </motion.ul>
            {b.yesterday_tip && level !== 'expert' && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border bg-background/40 p-3 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" /> <span><span className="font-medium">From yesterday:</span> {b.yesterday_tip}</span></div>
            )}
          </Panel>
          <Panel title={<span className="flex items-center gap-2"><History className="size-4 text-primary" /> Since last shift</span>}>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {b.changed_since_last.map((c) => <li key={c}>{c}</li>)}
            </ul>
            {b.handover_note && <div className="mt-3 rounded-lg border bg-background/40 p-3 text-sm"><span className="font-medium">Handover note:</span> {b.handover_note}</div>}
          </Panel>
        </div>

        <Panel
          title="Checklist"
          action={level === 'expert' && !done ? <Button size="sm" variant="secondary" onClick={confirmGroup}><CheckCheck className="size-4" /> Confirm visual items</Button> : null}
        >
          <div className="space-y-5" data-testid="checklist">
            {GROUPS.map((g) => {
              const items = data.items.filter((i) => i.group === g.id)
              if (!items.length) return null
              return (
                <div key={g.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</span>
                    {level !== 'expert' && items.some((i) => !i.auto_filled && !values[i.id]) && (
                      <button className="text-xs font-medium text-primary hover:underline" onClick={() => confirmItems(items.filter((i) => !i.auto_filled))} data-testid={`confirm-${g.id}`}>
                        Confirm all {g.title.toLowerCase()}
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {items.map((i) => {
                      const checked = values[i.id] ?? false
                      const bad = i.auto_filled && i.value === false
                      return (
                        <label key={i.id} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2', bad ? 'border-soft/60 bg-soft/10' : checked ? 'bg-background/40' : 'bg-background/20', i.auto_filled && 'cursor-default')}>
                          <Checkbox className="size-5" checked={checked} disabled={i.auto_filled} onCheckedChange={(c) => setValues((v) => ({ ...v, [i.id]: !!c }))} />
                          <span className="flex-1 text-sm">{i.label}</span>
                          {i.auto_filled ? (
                            <Badge variant="outline" className="gap-1 text-[10px]" title={i.note ?? ''}><Cpu className="size-3" /> sensor</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground"><Eye className="size-3" /> check</Badge>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {flaggedSensors.length > 0 && (
            <p className="mt-4 text-sm text-soft">{flaggedSensors.map((i) => i.note ?? i.label).join(' · ')}</p>
          )}
          <Button size="lg" className="mt-5 h-14 w-full text-lg" disabled={!done} onClick={start} data-testid="go-cab">
            {done ? 'Start shift' : `${visual.filter((i) => !values[i.id]).length} items left to confirm`}
          </Button>
        </Panel>
      </div>
    </div>
  )
}
