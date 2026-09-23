import { motion } from 'motion/react'
import { ArrowRight, Fuel, Timer } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { PageHeader, Panel } from '@/components/Stat'
import type { AnomalyFlag, BriefRow } from '@/contract/types'
import { BRIEF_ROWS } from '@/lib/brief'
import { titleCase } from '@/lib/format'
import { useAnomalies, useOperatorId, useOperators } from '@/lib/queries'
import { cn } from '@/lib/utils'

/**
 * A brief row is flagged when a flag names it: by source_ts (proposed field) or, failing that,
 * by an explicit "(HH:MM)" or "the HH:MM hour" in the reason. A time mentioned only as a
 * comparison ("vs 0.43 L at 08:00") must not flag that row.
 */
function flagsForRow(row: BriefRow, flags: AnomalyFlag[]) {
  const [date, time] = row.timestamp.split(' ')
  const hour = time.slice(0, 5)
  return flags.filter((f) =>
    f.source_ts ? f.source_ts === row.timestamp : f.shift_date === date && (f.reason.includes(`(${hour})`) || f.reason.includes(`the ${hour} hour`)),
  )
}

function BriefTable({ flags }: { flags: AnomalyFlag[] }) {
  return (
    <Panel
      title="The brief's own telemetry, row by row"
      action={<span className="text-xs text-muted-foreground">data/brief_telemetry.csv · each row = the hour ending at its timestamp (assumption)</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="brief-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              {['Time', 'Engine h', 'Cycles', 'Fuel', 'Fuel / cycle', 'Idle', 'Seatbelt', 'Alert', 'Foresight'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {BRIEF_ROWS.map((r, i) => {
              const hits = flagsForRow(r, flags)
              const flagged = hits.length > 0
              return (
                <motion.tr
                  key={r.timestamp}
                  initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
                  animate={{ backgroundColor: flagged ? 'rgba(245,165,36,0.10)' : 'rgba(0,0,0,0)' }}
                  transition={{ delay: 0.4 + i * 0.35, duration: 0.5 }}
                  className="border-t align-top"
                  data-flagged={flagged}
                >
                  <td className="num px-3 py-3">{r.timestamp.slice(0, 16)}</td>
                  <td className="num px-3 py-3">{r.engine_hours}</td>
                  <td className="num px-3 py-3">{r.load_cycles}</td>
                  <td className="num px-3 py-3">{r.fuel_used_l} L</td>
                  <td className={cn('num px-3 py-3', flagged && 'font-semibold')}>{(r.fuel_used_l / r.load_cycles).toFixed(2)} L</td>
                  <td className={cn('num px-3 py-3', flagged && 'font-semibold')}>{r.idling_time_min} min <span className="text-muted-foreground">({Math.round((r.idling_time_min / 60) * 100)}%)</span></td>
                  <td className={cn('px-3 py-3', r.seatbelt_status === 'Unfastened' && 'font-semibold')}>{r.seatbelt_status}</td>
                  <td className="px-3 py-3">{r.safety_alert_triggered}</td>
                  <td className="px-3 py-3">
                    {flagged ? (
                      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.35 }} className="flex flex-wrap gap-1">
                        {[...new Set(hits.map((h) => h.rule))].map((rule) => <Badge key={rule} variant="outline" className="border-soft/60 text-soft">{titleCase(rule)}</Badge>)}
                      </motion.div>
                    ) : <span className="text-muted-foreground">No flag</span>}
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Both rows with a safety alert share one signature: belt off, high idle, almost no load cycles, about 4× the fuel per cycle. That fits an operator away from the seat with the engine running.
      </p>
    </Panel>
  )
}

function FlagCard({ f, i }: { f: AnomalyFlag; i: number }) {
  const hasBaseline = f.baseline != null
  const max = Math.max(f.value, f.baseline ?? 0) * 1.15 || 1
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }} className="rounded-xl border bg-card p-4" data-testid="flag">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn('uppercase', f.severity === 'coach' ? 'border-soft/60 text-soft' : 'text-muted-foreground')}>{f.severity}</Badge>
        <span className="font-medium">{titleCase(f.rule)}</span>
        <span className="num ml-auto text-xs text-muted-foreground">{f.shift_date}</span>
      </div>
      <p className="mt-2 text-sm">{f.reason}</p>
      {hasBaseline && (
        <div className="mt-3 space-y-1.5 text-xs">
          <div className="flex items-center gap-2"><span className="w-16 text-muted-foreground">This shift</span><div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-foreground" style={{ width: `${(f.value / max) * 100}%` }} /></div><span className="num w-12 text-right">{f.value}</span></div>
          <div className="flex items-center gap-2"><span className="w-16 text-muted-foreground">{f.z != null ? 'Your usual' : 'Limit'}</span><div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-muted-foreground" style={{ width: `${((f.baseline ?? 0) / max) * 100}%` }} /></div><span className="num w-12 text-right">{f.baseline}</span></div>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs">
        {f.z != null && <span className="num rounded bg-muted px-2 py-0.5">modified z = {f.z.toFixed(1)} (cutoff 3.5)</span>}
        {f.severity === 'coach' && <Link to="/training" className="ml-auto flex items-center gap-1 text-primary hover:underline">Lesson assigned <ArrowRight className="size-3.5" /></Link>}
        {f.severity === 'review' && <span className="ml-auto text-muted-foreground">Flagged for review, not judged</span>}
      </div>
    </motion.div>
  )
}

export default function FlagsPage() {
  const operator = useOperatorId()
  const flags = useAnomalies().data ?? []
  const name = useOperators().data?.find((o) => o.operator_id === operator)?.name
  const idleMin = BRIEF_ROWS.reduce((s, r) => s + r.idling_time_min, 0)
  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Unusual behaviour" sub={`${name ?? operator}: flags compare each operator with their own baseline first, so natural differences between operators aren't flagged as misbehaviour.`} />

      {operator === 'OP1001' && <div className="mb-5"><BriefTable flags={flags} /></div>}

      {operator === 'OP1001' && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Timer className="size-4" /> Idle in the brief's 4 hours</div><div className="num mt-1 text-2xl font-semibold">{idleMin} min</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Fuel className="size-4" /> Idle burn (from row 4)</div><div className="num mt-1 text-2xl font-semibold">≤ 2.0 L/h</div></div>
          <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">One idle hour a day cut</div><div className="num mt-1 text-2xl font-semibold">≈ 500 L/yr</div><div className="text-xs text-muted-foreground">2 L/h × 250 days · 1.34 t CO₂</div></div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {flags.map((f, i) => <FlagCard key={f.flag_id} f={f} i={i} />)}
        {!flags.length && <div className="text-sm text-muted-foreground">No flags for this operator.</div>}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Method: fixed rules (continuous idle over 10 min, belt off with engine on over 2 min, engine hours outside the shift, idle ratio over 40%) plus a modified z-score against the operator's last 20 shifts,
        M = 0.6745 (x − median) / MAD, flagged when |M| &gt; 3.5 (Iglewicz and Hoaglin). Flags lead to coaching, never automatic discipline.
      </p>
    </div>
  )
}
