/**
 * Live site view: one 3D scene, one camera that flies between top-down (the cab default: a
 * glanceable safety display at a fixed, true scale) and tilted 3D (demo stage and replay).
 */
import { useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Lock, Navigation2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { TrackedObject } from '@/contract/types'
import { cn } from '@/lib/utils'
import { useLive } from '@/store/live'
import { ObjectMarker } from './actors'
import { CameraRig, Driver } from './camera'
import { liveSource, type FrameSource } from './interp'
import { LabelDriver, type LabelRefs, type ObjLabel } from './labels'
import { Excavator } from './machine'
import { HazardSector, SensorSweep, SwingFan, Zones } from './overlays'
import { FrameContext, FxContext, kindOf, type FrameRef, type Kind, type SceneFx } from './scene'
import { Terrain } from './terrain'
import { Atmosphere, FogLayer, Rain, Splashes } from './weather'

interface Props {
  tilted?: boolean
  source?: FrameSource
  /** Objects to draw; defaults to the live frame's. */
  objects?: TrackedObject[]
  /** Ease the tilted camera towards the hazard during an alert. */
  director?: boolean
  className?: string
}

export function SiteView({ tilted = false, source = liveSource, objects, director = true, className }: Props) {
  const frameRef = useRef<FrameRef['current']>(null) as FrameRef
  const fx = useRef<SceneFx>({ truckFill: 0, lastT: 0, view: tilted ? 1 : 0, scenario: '' })
  const labels = useRef<LabelRefs>({ objects: new Map(), rings: [], growth: null, inhibit: null, compass: null })
  const kinds = useRef(new Map<string, Kind>())
  // Drop the pixel ratio if a tablet can't hold the frame rate; raise it again if it recovers.
  const [dpr, setDpr] = useState(1.5)
  const live = useLive(useShallow((s) => (s.cur?.frame.objects ?? []).map((o) => o.id)))
  const liveObjs = useLive.getState().cur?.frame.objects ?? []
  const list = objects ?? liveObjs.filter((o) => live.includes(o.id))
  // What an object is drawn as is decided the first time it is seen, so it never changes mid-run.
  for (const o of list) if (!kinds.current.has(o.id)) kinds.current.set(o.id, kindOf(o))

  const setObjLabel = (id: string) => (root: HTMLDivElement | null) => {
    if (!root) { labels.current.objects.delete(id); return }
    const [main, sub, arrow] = Array.from(root.children) as HTMLSpanElement[]
    labels.current.objects.set(id, { root, main, sub, arrow } satisfies ObjLabel)
  }

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-[#0a0e13]', className)} data-testid="site-view" data-view={tilted ? '3d' : 'top'}>
      <FxContext.Provider value={fx}>
        <FrameContext.Provider value={frameRef}>
          <Canvas
            shadows="percentage"
            dpr={dpr}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
            onCreated={(st) => { if (import.meta.env.DEV) (window as unknown as { __scene: unknown }).__scene = st.scene }}
          >
            {/* Contexts don't cross the Canvas boundary on their own. */}
            <FxContext.Provider value={fx}>
              <FrameContext.Provider value={frameRef}>
                <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
                <Driver source={source} frameRef={frameRef} />
                <PerspectiveCamera makeDefault fov={24} near={0.5} far={700} />
                <CameraRig tilted={tilted} director={director} />
                <Atmosphere />
                <Terrain />
                <FogLayer />
                <SensorSweep />
                <Zones />
                <HazardSector />
                <SwingFan />
                <Excavator />
                {list.map((o) => <ObjectMarker key={o.id} id={o.id} kind={kinds.current.get(o.id)!} />)}
                <Rain />
                <Splashes />
                <LabelDriver refs={labels} kinds={kinds} />
              </FrameContext.Provider>
            </FxContext.Provider>
          </Canvas>
        </FrameContext.Provider>
      </FxContext.Provider>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} ref={(el) => { labels.current.rings[i] = el }} className="num absolute left-0 top-0 rounded bg-black/55 px-1 text-[11px] font-medium text-slate-300/90" />
        ))}
        <div ref={(el) => { labels.current.growth = el }} className="absolute left-0 top-0 whitespace-nowrap rounded-md border border-primary/50 bg-black/75 px-2 py-1 text-xs font-semibold text-primary opacity-0 transition-opacity duration-500" data-testid="zone-growth" />
        <div ref={(el) => { labels.current.inhibit = el }} className="absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-md bg-hard px-2.5 py-1 text-sm font-black uppercase tracking-wider text-white opacity-0 shadow-lg shadow-hard/40">
          <Lock className="size-4" /> Motion inhibited
        </div>
        {list.map((o) => (
          <div
            key={o.id}
            ref={setObjLabel(o.id)}
            data-testid={`label-${o.id}`}
            className={cn(
              'group absolute left-0 top-0 flex flex-col items-center whitespace-nowrap rounded-lg border border-white/15 bg-black/75 px-2 py-1 leading-tight text-slate-200 opacity-0 shadow-md',
              'data-[tier=hard]:border-hard data-[tier=hard]:bg-hard data-[tier=hard]:text-white',
              'data-[tier=soft]:border-soft data-[tier=soft]:bg-black/85 data-[tier=soft]:text-soft',
              'data-[tier=watch]:border-primary/60 data-[tier=watch]:text-primary',
            )}
          >
            <span className="num text-[13px] font-semibold" />
            <span className="text-[11px] font-medium opacity-90" />
            <span className="absolute -left-5 top-1/2 hidden -translate-y-1/2 text-base group-data-[edge=1]:block">
              <span className="block">➤</span>
            </span>
          </div>
        ))}
        <div ref={(el) => { labels.current.compass = el }} className="absolute right-3 top-3 flex size-11 flex-col items-center justify-center rounded-full border border-white/10 bg-black/55 text-[10px] font-bold text-slate-300 backdrop-blur">
          <div className="flex flex-col items-center"><Navigation2 className="size-4 fill-slate-300" /><span>N</span></div>
        </div>
      </div>
    </div>
  )
}

export default SiteView
