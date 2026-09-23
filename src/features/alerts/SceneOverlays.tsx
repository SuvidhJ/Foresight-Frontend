/**
 * Overlays on top of the site view: the STOP flash when a hard alert fires, and a notice
 * when the weather turns (what changed, and what Foresight did about it).
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CloudRain } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { speak } from '@/lib/speech'
import { useLive } from '@/store/live'
import { useAudioGate } from '@/store/session'

/** A big STOP sign for the first 1.4 s of a hard alert, then the strip carries it. */
export function StopFlash() {
  const alertKey = useLive((s) => s.alertKey)
  const [show, setShow] = useState<string | null>(null)
  useEffect(() => {
    if (!alertKey.endsWith(':hard')) return
    setShow(alertKey)
    const id = setTimeout(() => setShow(null), 1400)
    return () => clearTimeout(id)
  }, [alertKey])
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={show}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          data-testid="stop-flash"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.05)_30%,rgba(239,68,68,0.45)_100%)]" />
          <motion.div
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            className="relative flex size-48 items-center justify-center text-white drop-shadow-[0_0_40px_rgba(239,68,68,0.8)]"
          >
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
              <polygon points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30" fill="#ef4444" stroke="#fff" strokeWidth="4" />
            </svg>
            <span className="relative text-5xl font-black tracking-wider">STOP</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * When rain or fog comes in, say what changed and what the assistant did about it. Numbers are
 * live, so the panel watches visibility fall and the zones grow. Braking distance scales with
 * 1/μ, so the stopping-distance figure comes straight from the reported friction.
 */
export function ConditionsNotice() {
  const c = useLive(
    useShallow((s) => {
      const f = s.cur?.frame
      if (!f) return null
      const v = f.conditions.visibility_m
      return {
        poor: f.conditions.rain_mm_h > 1 || v < 500,
        vis: v >= 1000 ? 1000 : Math.round(v / 5) * 5,
        rain: Math.round(f.conditions.rain_mm_h * 2) / 2,
        mu: Math.round(f.conditions.mu * 100) / 100,
        inner: Math.round(f.zones.inner_m * 100) / 100,
      }
    }),
  )
  const unlocked = useAudioGate((s) => s.unlocked)
  const [open, setOpen] = useState(false)
  const base = useRef<{ mu: number; inner: number } | null>(null)
  const wasPoor = useRef<boolean | null>(null)

  useEffect(() => {
    if (!c) return
    if (!c.poor) base.current = { mu: c.mu, inner: c.inner }
    if (wasPoor.current === false && c.poor) {
      setOpen(true)
      if (unlocked) speak('Rain and fog coming in. Visibility dropping. Safety zones widened.')
      const id = setTimeout(() => setOpen(false), 9000)
      wasPoor.current = c.poor
      return () => clearTimeout(id)
    }
    wasPoor.current = c.poor
  }, [c?.poor]) // eslint-disable-line react-hooks/exhaustive-deps

  const b = base.current
  const zones = b && c ? Math.round((c.inner / b.inner - 1) * 100) : 0
  const stopping = b && c ? Math.round((b.mu / c.mu - 1) * 100) : 0
  return (
    <AnimatePresence>
      {open && c && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute left-1/2 top-3 z-20 w-[min(560px,92%)] -translate-x-1/2 rounded-xl border border-primary/50 bg-black/80 p-3 shadow-2xl backdrop-blur"
          data-testid="conditions-notice"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-primary"><CloudRain className="size-4" /> Conditions changed</div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            <Fact label="Visibility" value={c.vis >= 1000 ? '>1 km' : `${c.vis} m`} />
            <Fact label="Rain" value={`${c.rain.toFixed(1)} mm/h`} />
            <Fact label="Safety zones" value={zones > 0 ? `+${zones}%` : '–'} />
            <Fact label="Stopping distance" value={stopping > 0 ? `+${stopping}%` : '–'} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Ground friction μ {c.mu.toFixed(2)}. Zones widened automatically; objects stay tracked where you can't see them.</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 px-2 py-1.5">
      <div className="num text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  )
}
