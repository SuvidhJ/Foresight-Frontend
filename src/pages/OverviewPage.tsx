import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, CloudRain, Fuel, RotateCcw, Sun, Sparkles, Wand2 } from 'lucide-react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { PageHeader, Panel, Ring, Stat } from '@/components/Stat'
import { RangeBar } from '@/components/RangeBar'
import type { Task, WhatIfRequest } from '@/contract/types'
import { api } from '@/lib/api'
import { inMinutes, mins, titleCase } from '@/lib/format'
import { useForecast, useLevel, useOperatorId, usePlan, useSummary, useTasks } from '@/lib/queries'
import { useSession } from '@/store/session'
import { cn } from '@/lib/utils'

const DEFAULT_WHATIF: WhatIfRequest = { rain_mm_h: 0, visibility_m: 5000, trucks_available: 3 }

function WeatherStrip() {
  const f = useForecast().data
  if (!f) return <div className="h-24 animate-pulse rounded-xl bg-card" />
  const now = new Date().getHours()
  return (
    <div className="grid grid-cols-12 gap-1" data-testid="weather-strip">
      {f.map((h) => {
        const rain = h.rain_mm_h > 0
        const current = Number(h.time.slice(0, 2)) === now
        return (
          <div key={h.time} className={cn('rounded-lg border px-1 py-2 text-center', rain ? 'border-sky-400/40 bg-sky-400/10' : 'bg-card', current && 'ring-1 ring-primary')}>
            <div className="num text-xs text-muted-foreground">{h.time}</div>
            {rain ? <CloudRain className="mx-auto my-1 size-5 text-sky-300" /> : <Sun className="mx-auto my-1 size-5 text-muted-foreground" />}
            <div className="num text-sm">{Math.round(h.temp_c)}°</div>
            <div className={cn('num text-[10px]', rain ? 'text-sky-300' : 'text-muted-foreground')}>{rain ? `${h.rain_mm_h} mm/h` : h.visibility_m < 1000 ? `vis ${h.visibility_m} m` : 'dry'}</div>
          </div>
        )
      })}
    </div>
  )
}

const SHORT: Record<string, string> = { 'Production formula': 'Formula', 'Operator pace': 'Your pace' }

function Waterfall({ t }: { t: Task }) {
  const data = useMemo(() => {
    let run = 0
    const rows = t.eta_breakdown.map((s, i) => {
      if (i === 0) { run = s.minutes; return { name: s.label, base: 0, value: s.minutes, label: `${Math.round(s.minutes)}`, total: true } }
      const base = s.minutes >= 0 ? run : run + s.minutes
      run += s.minutes
      return { name: s.label, base, value: Math.abs(s.minutes), label: `${s.minutes >= 0 ? '+' : '−'}${Math.abs(Math.round(s.minutes))}`, total: false }
    })
    rows.push({ name: 'P50', base: 0, value: t.p50_min, label: `${Math.round(t.p50_min)}`, total: true })
    rows.push({ name: 'P10–P90', base: t.p10_min, value: t.p90_min - t.p10_min, label: `${Math.round(t.p10_min)}–${Math.round(t.p90_min)}`, total: false })
    return rows
  }, [t])
  return (
    <div className="h-64" data-testid="waterfall">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 22, right: 8, left: -12, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} tickFormatter={(n: string) => SHORT[n] ?? n} />
          <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} axisLine={false} tickLine={false} unit=" m" />
          <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="a" radius={[4, 4, 4, 4]}>
            {data.map((d) => <Cell key={d.name} fill={d.total ? 'var(--chart-1)' : d.name === 'P10–P90' ? 'color-mix(in oklab, var(--chart-1) 35%, transparent)' : 'var(--chart-2)'} />)}
            <LabelList dataKey="label" position="top" fill="var(--foreground)" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function TaskSheet({ t, onClose }: { t: Task | null; onClose: () => void }) {
  return (
    <Sheet open={!!t} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl">
        {t && (
          <>
            <SheetHeader>
              <SheetTitle>{t.zone} · {titleCase(t.type)}</SheetTitle>
              <SheetDescription>
                {t.quantity_m3} m³ · P50 {mins(t.p50_min)} (P10 {mins(t.p10_min)} – P90 {mins(t.p90_min)}) · ETA {inMinutes(t.p50_min)}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 overflow-y-auto px-4 pb-6">
              <div>
                <h3 className="mb-1 text-sm font-semibold">How this estimate is built</h3>
                <p className="mb-2 text-xs text-muted-foreground">
                  Production formula Q = V × FF × E × 3600 / t<sub>cycle</sub> gives the prior; a quantile model adjusts it for conditions and this operator's pace
                  (shrunk towards 1 when history is short); conformal calibration sets the P10–P90 band.
                </p>
                <Waterfall t={t} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Risk factors and what to do</h3>
                <div className="space-y-2">
                  {t.risk_factors.map((r) => (
                    <div key={r.name} className="rounded-lg border bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{r.name}</span>
                        <RiskLevel level={r.level} />
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{r.note}</div>
                      <div className="mt-2 flex items-start gap-2 text-sm"><ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" /> {r.action}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Risk level is not an alert, so it uses bars, not alert colours. */
function RiskLevel({ level }: { level: 'low' | 'med' | 'high' }) {
  const n = level === 'high' ? 3 : level === 'med' ? 2 : 1
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`${level} risk`}>
      <span className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => <span key={i} className={cn('w-1 rounded-sm', i <= n ? 'bg-foreground' : 'bg-muted')} style={{ height: 4 + i * 3 }} />)}
      </span>
      {level === 'med' ? 'Medium' : titleCase(level)}
    </span>
  )
}

export default function OverviewPage() {
  const operator = useOperatorId()
  const role = useSession((s) => s.role)
  const level = useLevel()
  const tasksQ = useTasks()
  const plan = usePlan().data
  const summary = useSummary().data
  const [applied, setApplied] = useState(false)
  const [open, setOpen] = useState<Task | null>(null)
  const [whatIf, setWhatIf] = useState<WhatIfRequest>(DEFAULT_WHATIF)
  const [wiTasks, setWiTasks] = useState<Task[] | null>(null)
  const isWhatIf = JSON.stringify(whatIf) !== JSON.stringify(DEFAULT_WHATIF)

  useEffect(() => {
    if (!isWhatIf) { setWiTasks(null); return }
    const id = setTimeout(() => { api.whatIf(operator, whatIf).then(setWiTasks).catch(() => setWiTasks(null)) }, 150)
    return () => clearTimeout(id)
  }, [whatIf, isWhatIf, operator])

  const base = tasksQ.data ?? []
  const tasks = wiTasks ?? base
  const ordered = applied && plan ? plan.order.map((id) => tasks.find((t) => t.task_id === id)).filter((t): t is Task => !!t) : [...tasks].sort((a, b) => a.priority - b.priority)
  const max = Math.max(60, ...tasks.map((t) => t.p90_min)) * 1.05
  const total = ordered.reduce((s, t) => s + t.p50_min, 0)

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Shift overview" sub={`EXC001 · ${operator} · coaching level ${level}. Times are P10–P90 ranges with the P50 marked.`}>
        {isWhatIf && <Badge variant="outline" className="border-primary text-primary">What-if view: not the live plan</Badge>}
      </PageHeader>

      <div className="mb-5"><WeatherStrip /></div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {plan && (
            <Panel
              title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Suggested order</span>}
              action={<Button size="sm" variant={applied ? 'secondary' : 'default'} onClick={() => setApplied((v) => !v)} data-testid="apply-plan">{applied ? 'Undo' : 'Apply order'}</Button>}
            >
              <div className="flex flex-wrap items-center gap-2">
                {plan.order.map((id, i) => (
                  <span key={id} className="flex items-center gap-2">
                    <span className="rounded-md border bg-background px-2 py-1 text-sm font-medium">{base.find((t) => t.task_id === id)?.zone ?? id}</span>
                    {i < plan.order.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}
                  </span>
                ))}
                <Badge className="ml-auto bg-primary/15 text-primary">−{plan.saving_min} min at P50</Badge>
              </div>
              <p className="mt-3 text-sm">{plan.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">Every order of up to 6 tasks is tried through the ETA model under the hourly forecast; the lowest total P50 whose P90 still fits the shift wins.</p>
            </Panel>
          )}

          <Panel title="Today's tasks" action={<span className="num text-xs text-muted-foreground">Total P50 {mins(total)}</span>}>
            <div className="mb-2 grid grid-cols-[1fr_2fr_120px] gap-4 px-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Task</span><span>Time range (min)</span><span className="text-right">P10 · P50 · P90</span>
            </div>
            <motion.ul layout className="space-y-1.5" data-testid="task-list">
              {ordered.map((t) => (
                <motion.li
                  layout
                  key={t.task_id}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  onClick={() => setOpen(t)}
                  className="grid cursor-pointer grid-cols-[1fr_2fr_120px] items-center gap-4 rounded-lg border bg-background/40 px-3 py-3 hover:border-primary/50"
                  data-testid={`task-${t.task_id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      {t.zone}
                      {t.status === 'active' && <Badge className="bg-primary/15 text-[10px] text-primary">Now</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{titleCase(t.type)} · {t.quantity_m3} m³ · {t.risk_factors.map((r) => r.name).join(' · ')}</div>
                  </div>
                  <RangeBar p10={t.p10_min} p50={t.p50_min} p90={t.p90_min} max={max} />
                  <div className="num text-right text-sm">
                    <span className="text-muted-foreground">{Math.round(t.p10_min)}</span> · <span className="font-semibold">{Math.round(t.p50_min)}</span> · <span className="text-muted-foreground">{Math.round(t.p90_min)}</span>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
            <p className="mt-3 text-xs text-muted-foreground">Click a task for the step-by-step estimate and its risk factors.</p>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel
            title={<span className="flex items-center gap-2"><Wand2 className="size-4 text-primary" /> What-if planner</span>}
            action={isWhatIf && <Button size="sm" variant="ghost" onClick={() => setWhatIf(DEFAULT_WHATIF)}><RotateCcw className="size-3.5" /> Reset</Button>}
          >
            <div className="space-y-5" data-testid="whatif">
              <SliderRow label="Rain" value={`${whatIf.rain_mm_h} mm/h`} min={0} max={15} step={1} v={whatIf.rain_mm_h} onChange={(v) => setWhatIf({ ...whatIf, rain_mm_h: v })} />
              <SliderRow label="Visibility" value={whatIf.visibility_m >= 5000 ? 'clear' : `${whatIf.visibility_m} m`} min={0} max={4} step={1} v={[40, 100, 300, 1000, 5000].indexOf(whatIf.visibility_m)} onChange={(i) => setWhatIf({ ...whatIf, visibility_m: [40, 100, 300, 1000, 5000][i] })} />
              <SliderRow label="Trucks available" value={`${whatIf.trucks_available}`} min={0} max={4} step={1} v={whatIf.trucks_available} onChange={(v) => setWhatIf({ ...whatIf, trucks_available: v })} />
              <p className="text-xs text-muted-foreground">{role === 'supervisor' ? 'Book trucks against P90, not P50: that is what keeps trucks from queueing.' : 'See how conditions move your ranges before the day starts.'}</p>
            </div>
          </Panel>

          {plan && (
            <Panel title={<span className="flex items-center gap-2"><Fuel className="size-4 text-primary" /> Fuel plan</span>}>
              <div className="flex items-baseline gap-2"><span className="num text-2xl font-semibold">{plan.fuel_needed_l} L</span><span className="text-sm text-muted-foreground">needed for the remaining tasks</span></div>
              {plan.refuel_before_task && (
                <div className="mt-2 rounded-lg border bg-background/40 p-3 text-sm">
                  Refuel before <span className="font-semibold">{base.find((t) => t.task_id === plan.refuel_before_task)?.zone ?? plan.refuel_before_task}</span>: the tank won't cover the plan.
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Predicted hours × this machine's burn rate per task type, against the tank level.</p>
            </Panel>
          )}

          {summary && (
            <Panel title="This shift so far">
              <Ring value={summary.belt_compliance_pct} label="Seatbelt compliance (belted engine-on minutes)" />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Stat label="Idle" value={`${summary.idle_pct}%`} />
                <Stat label="Fuel used" value={`${summary.fuel_l} L`} />
              </div>
            </Panel>
          )}
        </div>
      </div>
      <TaskSheet t={open ? tasks.find((x) => x.task_id === open.task_id) ?? open : null} onClose={() => setOpen(null)} />
    </div>
  )
}

function SliderRow({ label, value, v, min, max, step, onChange }: { label: string; value: string; v: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm"><span>{label}</span><span className="num text-muted-foreground">{value}</span></div>
      <Slider value={[v]} min={min} max={max} step={step} onValueChange={([x]) => onChange(x)} aria-label={label} />
    </div>
  )
}
