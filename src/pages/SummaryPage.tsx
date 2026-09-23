import { useState } from 'react'
import { Lightbulb, Send, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RangeBar } from '@/components/RangeBar'
import { PageHeader, Panel, Ring, Stat } from '@/components/Stat'
import { api } from '@/lib/api'
import { mins, titleCase } from '@/lib/format'
import { useOperatorId, useOperators, useSummary } from '@/lib/queries'

export default function SummaryPage() {
  const operator = useOperatorId()
  const name = useOperators().data?.find((o) => o.operator_id === operator)?.name
  const s = useSummary().data
  const [note, setNote] = useState('')
  if (!s) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>
  const max = Math.max(...s.tasks.map((t) => t.p90_min)) * 1.05

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader title="Shift summary" sub={`${name ?? operator} · ${s.date}. You see this first; the supervisor sees the aggregates.`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Near-misses" value={s.near_misses} sub="soft or hard proximity events" />
        <Stat label="Median warning time" value={s.median_warning_s != null ? `${s.median_warning_s.toFixed(1)} s` : '—'} sub="before breach, from the log" />
        <Stat label="Idle" value={`${s.idle_pct}%`} sub="of engine-on time" />
        <Stat label="Fuel" value={`${s.fuel_l} L`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Tasks against their ranges">
          <div className="space-y-3">
            {s.tasks.map((t) => (
              <div key={t.task_id} className="grid grid-cols-[140px_1fr_90px] items-center gap-3">
                <div className="text-sm"><div className="font-medium">{t.zone}</div><div className="text-xs text-muted-foreground">{titleCase(t.status)}</div></div>
                <RangeBar p10={t.p10_min} p50={t.p50_min} p90={t.p90_min} max={max} />
                <div className="num text-right text-xs text-muted-foreground">{mins(t.p50_min)}</div>
              </div>
            ))}
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel title="Seatbelt"><Ring value={s.belt_compliance_pct} label="Belted engine-on minutes" /></Panel>
          <Panel>
            <div className="flex items-start gap-2 text-sm"><ThumbsUp className="mt-0.5 size-4 shrink-0 text-ok" /> <span><span className="font-medium">Went well:</span> {s.went_well}</span></div>
            <div className="mt-3 flex items-start gap-2 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" /> <span><span className="font-medium">One tip:</span> {s.tip}</span></div>
          </Panel>
          <Panel title="Handover note for the next operator">
            <Textarea placeholder="Machine issues, open hazards, where you left off… (or hold V in the cab to dictate)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-24" />
            <Button className="mt-3 w-full" disabled={!note.trim()} onClick={async () => { await api.handover(operator, note); toast.success('Handover saved: it appears on the next pre-shift screen'); setNote('') }}>
              <Send className="size-4" /> Save handover
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  )
}
