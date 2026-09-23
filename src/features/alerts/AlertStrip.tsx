import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CircleCheckBig, OctagonAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AckRequest, AlertEvent } from '@/contract/types'
import { api } from '@/lib/api'
import { bearingOf, relativeSide } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { useLive } from '@/store/live'

const REASONS: { code: NonNullable<AckRequest['reason_code']>; label: string; key: string }[] = [
  { code: 'known_hazard', label: 'Known hazard', key: '1' },
  { code: 'spotter_present', label: 'Spotter present', key: '2' },
  { code: 'false_alarm', label: 'False alarm', key: '3' },
]

function useActiveAlert(): AlertEvent | null {
  useLive((s) => s.alertKey)
  return useLive.getState().cur?.frame.active_alert ?? null
}

/**
 * Where the alert's object is, relative to where the cab faces (the house turns with the swing),
 * rounded so this re-renders a few times a second, not at 10 Hz.
 */
function useHazard(objectId: string | null | undefined) {
  return useLive(
    useShallow((s) => {
      const f = s.cur?.frame
      const o = f?.objects.find((x) => x.id === objectId)
      if (!f || !o) return null
      const m = f.machine
      const b = bearingOf(o.x - m.x, o.y - m.y)
      const rel = ((b - m.swing_deg + 540) % 360) - 180
      const d = Math.hypot(o.x - m.x, o.y - m.y)
      // closing speed: velocity component towards the machine
      const closing = d > 0.01 ? -((o.x - m.x) * o.vx + (o.y - m.y) * o.vy) / d : 0
      return {
        rel: Math.round(rel / 3) * 3,
        side: relativeSide(b, m.swing_deg),
        d: Math.round(d * 10) / 10,
        closing: Math.round(closing * 10) / 10,
        t: o.t_cpa_s != null ? Math.round(o.t_cpa_s * 10) / 10 : null,
        cls: o.cls,
      }
    }),
  )
}

/** Mini radar: the cab faces up; the dot is the hazard. */
function HazardDial({ rel, side, tier, size = 76 }: { rel: number; side: string; tier: 'soft' | 'hard'; size?: number }) {
  const r = size / 2
  const a = (rel * Math.PI) / 180
  const dot = { x: r + Math.sin(a) * (r - 9), y: r - Math.cos(a) * (r - 9) }
  const c = tier === 'hard' ? '#ffffff' : 'var(--soft)'
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5" data-testid="hazard-dial" data-side={side}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={r} cy={r} r={r - 2} fill="rgba(0,0,0,0.35)" stroke={c} strokeOpacity={0.5} strokeWidth={2} />
        <circle cx={r} cy={r} r={(r - 2) * 0.55} fill="none" stroke={c} strokeOpacity={0.25} strokeWidth={1} />
        <path d={`M ${r} ${r} L ${r + Math.sin(a - 0.35) * (r - 3)} ${r - Math.cos(a - 0.35) * (r - 3)} A ${r - 3} ${r - 3} 0 0 1 ${r + Math.sin(a + 0.35) * (r - 3)} ${r - Math.cos(a + 0.35) * (r - 3)} Z`} fill={c} fillOpacity={0.28} />
        {/* the machine, cab facing up */}
        <rect x={r - 5} y={r - 6} width={10} height={12} rx={2} fill={c} fillOpacity={0.9} />
        <path d={`M ${r - 4} ${r - 8} L ${r} ${r - 14} L ${r + 4} ${r - 8} Z`} fill={c} fillOpacity={0.9} />
        <circle cx={dot.x} cy={dot.y} r={6} fill={c}>
          <animate attributeName="r" values="5;7;5" dur={tier === 'hard' ? '0.5s' : '1s'} repeatCount="indefinite" />
        </circle>
      </svg>
      <span className="text-xs font-black uppercase tracking-widest">{side}</span>
    </div>
  )
}

/** Time to closest approach as a shrinking ring (full at 8 s or more). */
function CountdownRing({ t, size = 76 }: { t: number; size?: number }) {
  const r = size / 2 - 5
  const k = Math.max(0, Math.min(1, t / 8))
  const len = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid="countdown">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth={6} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - k)} style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="num text-xl font-bold">{t.toFixed(1)}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">sec</span>
      </div>
    </div>
  )
}

/** Calm state: shows the assistant is working, not just silent. */
function AllClear({ compact }: { compact: boolean }) {
  const info = useLive(
    useShallow((s) => {
      const f = s.cur?.frame
      if (!f) return null
      const m = f.machine
      const people = f.objects.filter((o) => o.cls === 'person').map((o) => Math.hypot(o.x - m.x, o.y - m.y))
      return { n: f.objects.length, nearest: people.length ? Math.round(Math.min(...people)) : null }
    }),
  )
  return (
    <>
      <ShieldCheck className={cn('shrink-0 text-ok', compact ? 'size-7' : 'size-9')} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={cn('font-semibold text-foreground', compact ? 'text-base' : 'text-2xl')}>All clear</div>
        {info && (
          <div className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
            Tracking {info.n} {info.n === 1 ? 'object' : 'objects'}{info.nearest != null ? ` · nearest person ${info.nearest} m` : ' · no people nearby'}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * One alert at a time: tier = colour + shape + sound. Soft can be acknowledged (Space) or
 * dismissed with a reason (D). Hard has no buttons: it clears only when the hazard clears,
 * and then says so, with the warning time that was logged.
 */
export function AlertStrip({ compact = false }: { compact?: boolean }) {
  const a = useActiveAlert()
  const [acked, setAcked] = useState<string | null>(null)
  const [dismissFor, setDismissFor] = useState<AlertEvent | null>(null)
  const [restored, setRestored] = useState<{ id: string; warned: number | null } | null>(null)
  const lastHard = useRef<AlertEvent | null>(null)
  const hz = useHazard(a?.object_id)

  const tier = a && a.tier !== 'log' ? a.tier : null
  useEffect(() => {
    if (tier === 'hard') { lastHard.current = a; setRestored(null); return }
    if (!tier && lastHard.current) {
      setRestored({ id: lastHard.current.alert_id, warned: lastHard.current.warning_time_s ?? null })
      lastHard.current = null
      const id = setTimeout(() => setRestored(null), 5000)
      return () => clearTimeout(id)
    }
    if (tier) setRestored(null)
  }, [tier, a?.alert_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const ack = async () => {
    if (!a || a.tier !== 'soft') return
    setAcked(a.alert_id)
    await api.ack({ alert_id: a.alert_id, method: 'button', action: 'ack' }).catch(() => toast.error('Acknowledge failed: the engine did not respond'))
  }
  const dismiss = async (code: NonNullable<AckRequest['reason_code']>) => {
    const target = dismissFor
    setDismissFor(null)
    if (!target) return
    await api.ack({ alert_id: target.alert_id, method: 'button', action: 'dismiss', reason_code: code })
    toast(`Dismissed with reason: ${REASONS.find((r) => r.code === code)?.label}. Logged; 3 of the same kind in a shift go to review.`)
  }

  useHotkeys('space', (e) => { e.preventDefault(); void ack() }, { enabled: a?.tier === 'soft' }, [a?.alert_id])
  useHotkeys('d', () => { if (a?.tier === 'soft') setDismissFor(a) }, [a?.alert_id])

  const isAcked = tier === 'soft' && acked === a?.alert_id
  const dial = compact ? 58 : 76
  const state = tier ?? (restored ? 'restored' : 'clear')

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tier ? a!.alert_id : state}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.18 }}
          data-testid="alert-strip"
          data-tier={tier ?? 'none'}
          data-state={state}
          className={cn(
            'flex w-full items-center gap-4 border-t px-5',
            compact ? 'min-h-20 py-2' : 'min-h-28 py-3',
            state === 'clear' && 'border-border bg-panel',
            state === 'restored' && 'border-ok bg-ok/15',
            tier === 'soft' && 'border-soft bg-soft/15 text-foreground',
            tier === 'hard' && 'border-hard bg-hard text-hard-foreground',
          )}
        >
          {state === 'clear' && <AllClear compact={compact} />}
          {state === 'restored' && restored && (
            <>
              <CircleCheckBig className={cn('shrink-0 text-ok', compact ? 'size-8' : 'size-11')} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className={cn('font-bold text-ok', compact ? 'text-lg' : 'text-3xl')}>Clear · motion restored</div>
                <div className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-base')}>
                  Near-miss logged for the supervisor{restored.warned != null && <> · you were warned <span className="num font-semibold text-foreground">{restored.warned.toFixed(1)} s</span> before the breach</>}
                </div>
              </div>
            </>
          )}
          {tier === 'soft' && a && (
            <>
              {hz ? <HazardDial rel={hz.rel} side={hz.side} tier="soft" size={dial} /> : <TriangleAlert className={cn('shrink-0 fill-soft text-soft-foreground', compact ? 'size-9' : 'size-12')} aria-label="Soft alert" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {hz && <TriangleAlert className={cn('shrink-0 fill-soft text-soft-foreground', compact ? 'size-5' : 'size-7')} aria-label="Soft alert" />}
                  <div className={cn('font-semibold leading-tight', compact ? 'text-lg' : 'text-3xl')}>{a.reasons[0]}</div>
                </div>
                <div className={cn('mt-1 flex flex-wrap items-center gap-x-3 text-muted-foreground', compact ? 'text-xs' : 'text-base')}>
                  {hz && <span><span className="num font-semibold text-foreground">{hz.d.toFixed(1)} m</span> away{hz.closing > 0.1 && <>, closing <span className="num font-semibold text-foreground">{hz.closing.toFixed(1)} m/s</span></>}</span>}
                  {a.reasons.slice(1).map((r) => <span key={r}>· {r}</span>)}
                </div>
                <div className={cn('mt-1 font-medium text-soft', compact ? 'text-xs' : 'text-sm')}>{a.action}</div>
              </div>
              {hz?.t != null && <CountdownRing t={hz.t} size={dial} />}
              <SourceChip a={a} />
              {!compact && (
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Button size="lg" variant={isAcked ? 'secondary' : 'default'} className="h-12 min-w-36 bg-soft text-soft-foreground hover:bg-soft/90" onClick={ack} disabled={isAcked}>
                    {isAcked ? 'Acknowledged' : 'Acknowledge'} <kbd className="ml-2 rounded bg-black/20 px-1.5 text-xs">Space</kbd>
                  </Button>
                  <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setDismissFor(a)}>
                    Dismiss with reason (D)
                  </button>
                </div>
              )}
            </>
          )}
          {tier === 'hard' && a && (
            <>
              <OctagonAlert className={cn('shrink-0 fill-white text-hard', compact ? 'size-11' : 'size-16')} aria-label="Hard alert" />
              <div className="min-w-0 flex-1">
                <div className={cn('font-black uppercase tracking-wide', compact ? 'text-xl' : 'text-4xl')}>Stop · {a.reasons[0]}</div>
                <div className={cn('mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold', compact ? 'text-xs' : 'text-base')}>
                  <span>MOTION INHIBITED · clears when the hazard clears</span>
                  {a.warning_time_s != null && <span className="num rounded bg-black/25 px-2 py-0.5">warned {a.warning_time_s.toFixed(1)} s before breach</span>}
                </div>
              </div>
              {hz && <HazardDial rel={hz.rel} side={hz.side} tier="hard" size={dial} />}
              <SourceChip a={a} inverted />
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <Dialog open={!!dismissFor} onOpenChange={(o) => !o && setDismissFor(null)}>
        <DialogContent
          className="sm:max-w-md"
          onKeyDown={(e) => {
            const r = REASONS.find((x) => x.key === e.key)
            if (r) {
              // keep 1–3 from also loading a scenario
              e.stopPropagation()
              e.preventDefault()
              void dismiss(r.code)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Dismiss this warning?</DialogTitle>
            <DialogDescription>
              {dismissFor?.reasons[0]}. Choose a reason. Every dismissal is logged; three of the same kind in a shift are flagged for review. Nothing is muted automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {REASONS.map((r) => (
              <Button key={r.code} variant="secondary" size="lg" className="h-14 justify-between text-base" onClick={() => dismiss(r.code)}>
                {r.label}
                <kbd className="rounded bg-black/30 px-2 text-xs">{r.key}</kbd>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Shows who raised the alert, so "rules decide, the model warns earlier" is visible on every alert. */
function SourceChip({ a, inverted }: { a: AlertEvent; inverted?: boolean }) {
  const label = a.source === 'rule' ? 'Rule' : a.source === 'model' ? 'Model' : 'Operator'
  return (
    <div
      className={cn(
        'shrink-0 rounded-md border px-2.5 py-1 text-center text-xs font-semibold uppercase tracking-wider',
        inverted ? 'border-white/40 text-white' : 'border-border text-muted-foreground',
      )}
      title={a.source === 'rule' ? 'Raised by a deterministic guardrail' : 'Raised early by the near-miss model; the guardrail still makes the final call'}
    >
      <div>{label}</div>
      {a.source === 'model' && a.p_nearmiss != null && <div className="num text-[10px] normal-case opacity-80">p {a.p_nearmiss.toFixed(2)}</div>}
      {a.source === 'rule' && <div className="text-[10px] normal-case opacity-80">guardrail</div>}
    </div>
  )
}
