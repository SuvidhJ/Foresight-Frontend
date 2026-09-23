import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Armchair, CircleCheck, CircleX, CloudRain, Eye, Fuel, Gauge, Lock, LockOpen, Mic, Power, Radio, ShieldAlert, WifiOff } from 'lucide-react'
import RecordRTC, { StereoAudioRecorder } from 'recordrtc'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { AgentAnswer } from '@/contract/types'
import { api } from '@/lib/api'
import { inMinutes, mins } from '@/lib/format'
import { useLevel, useOperatorId, useOperators, useTasks } from '@/lib/queries'
import { SCENARIOS, type ScenarioId } from '@/lib/scenarios'
import { unlockAudio } from '@/lib/sound'
import { speak, speechAvailable } from '@/lib/speech'
import { cn } from '@/lib/utils'
import { useShallow } from 'zustand/react/shallow'
import { useLive } from '@/store/live'
import { useAudioGate } from '@/store/session'

/** Offline if no frame for 1 s (doc 01 failure modes: heartbeat → "assistant offline" banner). */
export function useStale() {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    const id = setInterval(() => {
      const last = useLive.getState().lastAt
      setStale(!last || performance.now() - last > 1000)
    }, 250)
    return () => clearInterval(id)
  }, [])
  return stale
}

export function Banners() {
  const stale = useStale()
  const sensorOk = useLive((s) => s.cur?.frame.sensor_ok ?? true)
  return (
    <AnimatePresence>
      {stale && (
        <motion.div key="off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-3 bg-hard px-4 py-3 text-lg font-bold text-white" data-testid="offline-banner">
          <WifiOff className="size-6" /> Assistant offline: no live data. The machine's own safety systems are unaffected.
        </motion.div>
      )}
      {!stale && !sensorOk && (
        <motion.div key="deg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-3 bg-soft px-4 py-3 text-lg font-bold text-soft-foreground">
          <ShieldAlert className="size-6" /> Detection degraded: area not confirmed clear
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Status({ ok, icon: Icon, label, value, warn }: { ok: boolean; icon: typeof Power; label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn('rounded-lg border px-3 py-2', ok ? 'border-border bg-card' : warn ? 'border-soft/60 bg-soft/10' : 'border-hard/60 bg-hard/10')}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn('size-3.5 shrink-0', !ok && (warn ? 'text-soft' : 'text-hard'))} />
        <span className="flex-1 truncate">{label}</span>
        {ok ? <CircleCheck className="size-4 text-ok" aria-label="OK" /> : <CircleX className={cn('size-4', warn ? 'text-soft' : 'text-hard')} aria-label="Attention" />}
      </div>
      <div className="mt-0.5 truncate text-base font-semibold">{value}</div>
    </div>
  )
}

/** Machine and operator state, updated from the live frame (re-renders only when values change). */
export function StatusPanel() {
  const { belt, seat, engine, lockout, fuel, stab } = useLive(
    useShallow((s) => {
      const m = s.cur?.frame.machine
      return {
        belt: m?.belt_fastened ?? true,
        seat: m?.seat_occupied ?? true,
        engine: m?.engine_on ?? false,
        lockout: m?.hydraulic_lockout ?? false,
        fuel: Math.round(m?.fuel_pct ?? 0),
        stab: Math.round((m?.stability_ratio ?? 0) * 100) / 100,
      }
    }),
  )
  const away = engine && !seat
  return (
    <div className="grid grid-cols-2 gap-2">
      <Status ok={belt || !engine} icon={CircleCheck} label="Seatbelt" value={belt ? 'Fastened' : 'Unfastened'} />
      <Status ok={seat || !engine} icon={Armchair} label="Seat" value={seat ? 'Occupied' : 'Empty'} warn={away} />
      <Status ok icon={Power} label="Engine" value={engine ? 'Running' : 'Off'} />
      <Status ok icon={lockout ? Lock : LockOpen} label="Hydraulics" value={lockout ? 'Locked out' : 'Live'} />
      <Status ok={fuel > 20} warn icon={Fuel} label="Fuel" value={`${fuel.toFixed(0)}%`} />
      <Status ok={stab < 0.75} warn={stab < 0.9} icon={Gauge} label="Tipping load" value={`${Math.round(stab * 100)}%`} />
    </div>
  )
}

export function ConditionsChip() {
  const c = useLive(
    useShallow((s) => {
      const x = s.cur?.frame.conditions
      return x ? { ground: x.ground, rain_mm_h: Math.round(x.rain_mm_h * 2) / 2, visibility_m: x.visibility_m >= 1000 ? 1000 : Math.round(x.visibility_m / 5) * 5, mu: x.mu } : null
    }),
  )
  if (!c) return null
  const poor = c.visibility_m < 200 || c.rain_mm_h > 0.5
  return (
    <div className={cn('flex items-center gap-3 rounded-full border px-3 py-1 text-sm', poor ? 'border-soft/50 text-soft' : 'border-border text-muted-foreground')} data-testid="conditions">
      <span className="flex items-center gap-1"><CloudRain className="size-4" /> {c.ground}{c.rain_mm_h > 0.2 ? ` · ${c.rain_mm_h.toFixed(1)} mm/h` : ''}</span>
      <span className="flex items-center gap-1"><Eye className="size-4" /> <span className="num">{c.visibility_m >= 1000 ? '>1 km' : `${Math.round(c.visibility_m)} m`}</span></span>
      <span className="num">μ {c.mu.toFixed(2)}</span>
    </div>
  )
}

/** The task in hand with its P10–P90 window as clock times. */
export function EtaCard() {
  const tasks = useTasks().data
  const t = tasks?.find((x) => x.status === 'active') ?? tasks?.[0]
  if (!t) return <div className="h-28 animate-pulse rounded-lg bg-card" />
  const span = t.p90_min - t.p10_min || 1
  return (
    <div className="rounded-lg border bg-card p-4" data-testid="eta-card">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Now</div>
        <div className="text-xs text-muted-foreground">{t.type.replace('_', ' ')} · {t.quantity_m3} m³</div>
      </div>
      <div className="mt-1 text-2xl font-semibold">{t.zone}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-sm text-muted-foreground">ETA</span>
        <span className="num text-4xl font-bold text-primary">{inMinutes(t.p50_min)}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-muted">
        <div className="absolute inset-y-0 rounded-full bg-primary/35" style={{ left: 0, right: 0 }} />
        <div className="absolute -top-1 h-4 w-1 rounded bg-primary" style={{ left: `${((t.p50_min - t.p10_min) / span) * 100}%` }} />
      </div>
      <div className="num mt-1.5 flex justify-between text-sm text-muted-foreground">
        <span>{inMinutes(t.p10_min)}</span>
        <span>{mins(t.p10_min)}–{mins(t.p90_min)}</span>
        <span>{inMinutes(t.p90_min)}</span>
      </div>
    </div>
  )
}

/**
 * Push-to-talk: hold V or the button. Records 16 kHz mono WAV (what Vosk expects) and sends
 * it to M4's /api/voice. The answer is spoken with a local voice.
 */
export function PushToTalk({ onAnswer }: { onAnswer?: (a: AgentAnswer) => void }) {
  const operator = useOperatorId()
  const [state, setState] = useState<'idle' | 'rec' | 'thinking'>('idle')
  const rec = useRef<{ r: RecordRTC; stream: MediaStream } | null>(null)

  const start = async () => {
    if (rec.current || state !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new RecordRTC(stream, { type: 'audio', mimeType: 'audio/wav', recorderType: StereoAudioRecorder, desiredSampRate: 16000, numberOfAudioChannels: 1 })
      r.startRecording()
      rec.current = { r, stream }
      setState('rec')
    } catch {
      toast.error('Microphone unavailable. Over the network the tablet needs HTTPS for the microphone.')
    }
  }
  const stop = async () => {
    const cur = rec.current
    if (!cur) return
    rec.current = null
    setState('thinking')
    await new Promise<void>((res) => cur.r.stopRecording(() => res()))
    cur.stream.getTracks().forEach((t) => t.stop())
    try {
      const a = await api.voice(cur.r.getBlob(), operator)
      onAnswer?.(a)
      speak(a.text, { interrupt: true })
    } catch {
      toast.error('Voice service did not answer')
    } finally {
      setState('idle')
    }
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v' && !e.repeat && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) void start()
    }
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v') void stop() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  })

  return (
    <Button
      size="lg"
      variant="secondary"
      className={cn('h-16 w-full gap-3 text-lg', state === 'rec' && 'bg-primary text-primary-foreground hover:bg-primary')}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={() => state === 'rec' && void stop()}
      data-testid="ptt"
    >
      {state === 'rec' ? <Radio className="size-6 animate-pulse" /> : <Mic className="size-6" />}
      {state === 'rec' ? 'Listening… release to send' : state === 'thinking' ? 'Thinking…' : 'Hold to talk'}
      <kbd className="rounded bg-black/25 px-2 text-sm">V</kbd>
    </Button>
  )
}

/**
 * One gesture unlocks audio for the page (browsers block sound until then). On the demo stage
 * the same click picks the scenario to run, so the presenter starts a story in one step.
 */
export function StartShiftGate({ mode = 'cab' }: { mode?: 'cab' | 'stage' }) {
  const { unlocked, setUnlocked } = useAudioGate()
  const level = useLevel()
  const operator = useOperatorId()
  const name = useOperators().data?.find((o) => o.operator_id === operator)?.name
  if (unlocked) return null
  const start = (scenario?: ScenarioId) => {
    // Close at once; the audio context resumes in the background (still inside the click's user gesture).
    setUnlocked()
    unlockAudio().catch(() => toast.error('Sound could not start in this browser'))
    if (scenario) api.startScenario(scenario).catch(() => toast.error('Could not start the scenario: engine not reachable'))
    setTimeout(() => { if (!speechAvailable()) toast('No offline voice found in this browser: alerts show and sound, but are not spoken.') }, 800)
  }
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm">
      {mode === 'cab' ? (
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary"><Power className="size-7" /></div>
          <h2 className="text-2xl font-semibold">Start shift{name ? `, ${name.split(' ')[0]}` : ''}</h2>
          <p className="mt-2 text-muted-foreground">EXC001 · coaching level <span className="font-medium capitalize text-foreground">{level}</span></p>
          <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left text-sm text-muted-foreground">
            <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> Alert sounds and spoken warnings</li>
            <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> Hold <kbd className="rounded bg-muted px-1 text-xs">V</kbd> to ask the assistant</li>
            <li className="flex gap-2"><CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" /> Your level changes the wording, never the safety limits</li>
          </ul>
          <Button size="lg" className="mt-6 h-14 w-full text-lg" onClick={() => start()} data-testid="start-shift" autoFocus>
            Start
          </Button>
        </div>
      ) : (
        <div className="w-full max-w-3xl rounded-2xl border bg-card p-7 shadow-2xl">
          <h2 className="text-2xl font-semibold">Start the demo</h2>
          <p className="mt-1 text-muted-foreground">Pick a scenario. Sound turns on with this click. Keys <kbd className="rounded bg-muted px-1 text-xs">1</kbd>–<kbd className="rounded bg-muted px-1 text-xs">4</kbd> switch scenarios at any time.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => (
              <button key={id} onClick={() => start(id)} className="group flex items-start gap-3 rounded-xl border bg-background/40 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5" data-testid={`gate-scenario-${id}`}>
                <span className="num flex size-9 shrink-0 items-center justify-center rounded-lg border text-lg font-semibold group-hover:border-primary group-hover:text-primary">{id}</span>
                <span>
                  <span className="block font-semibold">{SCENARIOS[id].name}</span>
                  <span className="block text-sm text-muted-foreground">{SCENARIOS[id].blurb}</span>
                </span>
              </button>
            ))}
          </div>
          <Button variant="ghost" className="mt-4 w-full" onClick={() => start()} data-testid="start-shift">Start without changing the scenario</Button>
        </div>
      )}
    </div>
  )
}
