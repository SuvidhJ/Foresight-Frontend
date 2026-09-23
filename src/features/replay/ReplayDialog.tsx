import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import type { LiveFrame } from '@/contract/types'
import { SiteView } from '@/features/site/SiteView'
import type { FrameSource } from '@/features/site/interp'
import { cn } from '@/lib/utils'
import { useLive, type Stamped } from '@/store/live'

interface Mark { t: number; tier: 'soft' | 'hard'; id: string }

/** First frame of each alert in the recorded window. */
function alertMarks(frames: LiveFrame[]): Mark[] {
  const seen = new Set<string>()
  const out: Mark[] = []
  for (const f of frames) {
    const a = f.active_alert
    if (a && a.tier !== 'log' && !seen.has(a.alert_id)) {
      seen.add(a.alert_id)
      out.push({ t: f.t, tier: a.tier, id: a.alert_id })
    }
  }
  return out
}

/**
 * Replays the last 30 s. The gap between the first soft warning and the hard breach is the
 * warning time the operator actually had, the number Foresight is judged on.
 */
export function ReplayDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [snapshot, setSnapshot] = useState<Stamped[]>([])
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const idx = useRef(0)

  useEffect(() => {
    if (!open) return
    const h = useLive.getState().history
    setSnapshot(h)
    setI(Math.max(0, h.length - 1))
    idx.current = Math.max(0, h.length - 1)
    setPlaying(false)
  }, [open])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setI((v) => {
        const n = Math.min(snapshot.length - 1, v + 1)
        if (n === snapshot.length - 1) setPlaying(false)
        idx.current = n
        return n
      })
    }, 100)
    return () => clearInterval(id)
  }, [playing, snapshot.length])

  const frames = useMemo(() => snapshot.map((s) => s.frame), [snapshot])
  const marks = useMemo(() => alertMarks(frames), [frames])
  const soft = marks.find((m) => m.tier === 'soft')
  const hard = marks.find((m) => m.tier === 'hard')
  // The engine's recorded warning time is authoritative; the gap between sampled frames is only a fallback.
  const recorded = frames.map((f) => f.active_alert).find((x) => x?.tier === 'hard' && x.warning_time_s != null)?.warning_time_s ?? null
  const warned = recorded ?? (soft && hard && hard.t > soft.t ? hard.t - soft.t : null)
  const t0 = frames[0]?.t ?? 0
  const t1 = frames.at(-1)?.t ?? 1
  const pos = (t: number) => `${((t - t0) / Math.max(0.1, t1 - t0)) * 100}%`
  const objects = useMemo(() => {
    // First sighting of each object, so it is drawn the same way it was live.
    const m = new Map<string, LiveFrame['objects'][number]>()
    frames.forEach((f) => f.objects.forEach((o) => { if (!m.has(o.id)) m.set(o.id, o) }))
    return [...m.values()]
  }, [frames])

  const source: FrameSource = useMemo(() => () => ({ prev: null, cur: frames[idx.current] ?? null, k: 1 }), [frames])
  idx.current = i

  const f = frames[i]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-3 sm:max-w-5xl" data-testid="replay">
        <DialogHeader>
          <DialogTitle>Replay: last {Math.round(t1 - t0)} s</DialogTitle>
          <DialogDescription>
            {warned != null ? (
              <>The operator was warned <span className="num font-semibold text-foreground">{warned.toFixed(1)} s</span> before the inner zone was breached.</>
            ) : marks.length ? 'Alerts in this window are marked on the timeline.' : 'No alerts in this window. Run scenario 2 (press 2) and replay it.'}
          </DialogDescription>
        </DialogHeader>
        <div className="h-[52vh] overflow-hidden rounded-lg border">
          {frames.length > 0 && <SiteView tilted source={source} objects={objects} />}
        </div>
        <div className="flex items-center gap-3">
          <Button size="icon" variant="secondary" onClick={() => { if (i >= frames.length - 1) setI(0); setPlaying((p) => !p) }} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <div className="relative flex-1 pt-5">
            {marks.map((m) => (
              <div key={m.id} className="absolute top-0 -translate-x-1/2 text-[10px] font-semibold uppercase" style={{ left: pos(m.t) }}>
                <span className={cn('rounded px-1', m.tier === 'hard' ? 'bg-hard text-white' : 'bg-soft text-soft-foreground')}>{m.tier}</span>
              </div>
            ))}
            {soft && hard && warned != null && (
              <div className="absolute top-[34px] h-1 rounded bg-soft/60" style={{ left: pos(soft.t), width: `calc(${pos(hard.t)} - ${pos(soft.t)})` }} />
            )}
            <Slider value={[i]} min={0} max={Math.max(0, frames.length - 1)} step={1} onValueChange={([v]) => { setPlaying(false); setI(v) }} />
          </div>
          <div className="num w-28 text-right text-sm text-muted-foreground">t = {f ? f.t.toFixed(1) : '–'} s</div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
