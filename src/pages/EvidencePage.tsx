import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FlaskConical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PageHeader, Panel } from '@/components/Stat'
import type { EvidenceAnalytics, EvidenceSafety } from '@/contract/types'
import { MOCKED, SAMPLE_EVIDENCE } from '@/lib/env'
import { useEvidence } from '@/lib/queries'
import { EVIDENCE_SAMPLE } from '@/lib/sample'
import { cn } from '@/lib/utils'
import { latencyStats, useLive } from '@/store/live'

const NOT = 'Not measured yet'

function useLatency() {
  const [s, setS] = useState(latencyStats(useLive.getState().latency))
  useEffect(() => {
    const id = setInterval(() => setS(latencyStats(useLive.getState().latency)), 1000)
    return () => clearInterval(id)
  }, [])
  return s
}

function Row({ measure, target, result, pass }: { measure: string; target: string; result: string | null; pass?: boolean | null }) {
  return (
    <tr className="border-t">
      <td className="px-3 py-3 text-sm">{measure}</td>
      <td className="px-3 py-3 text-sm text-muted-foreground">{target}</td>
      <td className={cn('num px-3 py-3 text-sm', result == null && 'text-muted-foreground italic', pass === true && 'text-ok', pass === false && 'text-hard')}>{result ?? NOT}</td>
    </tr>
  )
}

const f1 = (v: number | null | undefined, unit = '') => (v == null ? null : `${v.toFixed(1)}${unit}`)

export default function EvidencePage() {
  const q = useEvidence().data
  const sample = SAMPLE_EVIDENCE
  const safety: EvidenceSafety | undefined = sample ? EVIDENCE_SAMPLE.safety : q?.safety
  const analytics: EvidenceAnalytics | undefined = sample ? EVIDENCE_SAMPLE.analytics : q?.analytics
  const lat = useLatency()
  const m1Mocked = MOCKED.includes('m1')

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Evidence"
        sub="Every model is compared with a simpler baseline on held-out seeded scenarios, per event, not per frame. Results are filled in from real runs and never estimated."
      >
        {sample && <Badge className="bg-hard text-white">SAMPLE LAYOUT DATA · NOT RESULTS</Badge>}
      </PageHeader>

      <Panel title="Headline results" className="mb-5">
        <table className="w-full" data-testid="evidence-table">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="px-3 py-2">Measure</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Result</th></tr></thead>
          <tbody>
            <Row
              measure="Median warning time, model (M1) vs physics baseline (B0)"
              target="Longer than baseline at equal false alarms"
              result={safety?.median_warning_m1_s != null && safety.median_warning_b0_s != null ? `M1 ${safety.median_warning_m1_s.toFixed(1)} s vs B0 ${safety.median_warning_b0_s.toFixed(1)} s` : null}
              pass={safety?.median_warning_m1_s != null && safety.median_warning_b0_s != null ? safety.median_warning_m1_s > safety.median_warning_b0_s : null}
            />
            <Row measure="False alarms per operator-hour" target="At or under the budget set on validation data" result={safety?.false_alarms_per_hour_m1 != null ? `${safety.false_alarms_per_hour_m1.toFixed(2)} (B0 ${safety.false_alarms_per_hour_b0?.toFixed(2)})` : null} />
            <Row measure="Near-miss events warned before breach" target="Above 90%" result={f1(safety?.near_miss_warned_pct, '%')} pass={safety?.near_miss_warned_pct != null ? safety.near_miss_warned_pct > 90 : null} />
            <Row measure="Critical breaches raising a hard alert (guardrail)" target="100%" result={f1(safety?.guardrail_hard_pct, '%')} pass={safety?.guardrail_hard_pct != null ? safety.guardrail_hard_pct === 100 : null} />
            <Row measure="P10–P90 task-time coverage" target="80% ± 5 points" result={analytics?.coverage_p10_p90_pct != null ? `${analytics.coverage_p10_p90_pct.toFixed(0)}% (raw quantiles ${analytics.coverage_raw_pct?.toFixed(0)}%)` : null} pass={analytics?.coverage_p10_p90_pct != null ? Math.abs(analytics.coverage_p10_p90_pct - 80) <= 5 : null} />
            <Row measure="Planted behaviour patterns detected" target="Above 90% recall" result={analytics?.anomaly_recall_pct != null ? `${analytics.anomaly_recall_pct.toFixed(0)}% recall · ${analytics.anomaly_precision_pct?.toFixed(0)}% precision` : null} pass={analytics?.anomaly_recall_pct != null ? analytics.anomaly_recall_pct > 90 : null} />
            <Row measure="Brief rows 2 and 4 flagged; rows 1 and 3 not" target="All four correct" result={analytics?.brief_rows_correct != null ? `${analytics.brief_rows_correct} / 4` : null} pass={analytics?.brief_rows_correct != null ? analytics.brief_rows_correct === 4 : null} />
            <Row
              measure="Tick-to-screen alert latency (measured in this browser)"
              target="Under 200 ms"
              result={lat && !m1Mocked ? `p50 ${lat.p50} ms · p95 ${lat.p95} ms (n = ${lat.n})` : null}
              pass={lat && !m1Mocked ? lat.p95 < 200 : null}
            />
            <Row measure="Runs with no internet" target="Yes" result={null} />
          </tbody>
        </table>
        {m1Mocked && <p className="mt-3 text-xs text-muted-foreground">Latency is only reported against the real engine: with M1 mocked, frames are made inside the browser and the number would mean nothing.</p>}
        {safety?.shipped_model && <p className="mt-3 text-sm">Shipped: <span className="font-semibold">{safety.shipped_model === 'M1' ? 'the model (M1)' : 'the physics baseline (B0)'}</span>, by the ship rule: the model is used only if it warns earlier at the same false-alarm rate.</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Warning time: baseline vs model">
          {safety?.warning_hist.length ? (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={safety.warning_hist} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="bin_s" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} unit=" s" />
                  <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="b0" name="Physics baseline B0" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="m1" name="Model M1" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty what="the warning-time distribution" who="M1's evaluation run" />}
        </Panel>
        <Panel title="Task-time calibration">
          {analytics?.calibration.length ? (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={analytics.calibration} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis dataKey="nominal" type="number" domain={[0, 1]} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis domain={[0, 1]} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="nominal" name="Perfect calibration" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
                  <Line dataKey="empirical_raw" name="Raw quantiles" stroke="var(--chart-2)" dot={false} />
                  <Line dataKey="empirical_cqr" name="After conformal calibration" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty what="the calibration plot" who="M2's evaluation run" />}
        </Panel>
        <Panel title="Ablation: what each feature group adds" className="lg:col-span-2">
          {safety?.ablation.length ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2">Variant</th><th>Median warning</th><th>False alarms / h</th></tr></thead>
              <tbody>{safety.ablation.map((a) => <tr key={a.variant} className="border-t"><td className="py-2">{a.variant}</td><td className="num">{f1(a.median_warning_s, ' s') ?? '—'}</td><td className="num">{a.false_alarms_per_hour?.toFixed(2) ?? '—'}</td></tr>)}</tbody>
            </table>
          ) : <Empty what="the ablation table" who="M1's evaluation run" />}
        </Panel>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Protocol: 60/20/20 split by episode and operator; thresholds tuned on validation to a false-alarm budget; test set used once; one scenario family and one weather type held out entirely; robustness under 0.3 m position noise, 10% dropout and 200 ms delay.</p>
    </div>
  )
}

function Empty({ what, who }: { what: string; who: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground">
      <FlaskConical className="size-5" />
      <div>{NOT}: {what} appears here once {who} writes its results.</div>
    </div>
  )
}
