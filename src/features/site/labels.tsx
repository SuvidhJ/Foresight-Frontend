/**
 * Plain DOM labels over the canvas, moved to screen positions inside useFrame (drei <Html>
 * rendered empty boxes here). Text is only written when it changes.
 */
import { useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { bearingToMathRad, toWorld } from '@/lib/geo'
import { KIND_LABEL, useFrameRef, useFx, type Kind } from './scene'

export interface ObjLabel { root: HTMLDivElement; main: HTMLSpanElement; sub: HTMLSpanElement; arrow: HTMLSpanElement }
export interface LabelRefs {
  objects: Map<string, ObjLabel>
  rings: (HTMLDivElement | null)[]
  growth: HTMLDivElement | null
  inhibit: HTMLDivElement | null
  compass: HTMLDivElement | null
}

const RING_BEARING = 205
const EDGE = 44

function setText(el: HTMLElement, text: string) {
  if (el.textContent !== text) el.textContent = text
}

/** Contrast left at distance d with visibility V is exp(-3d/V); below 25% the operator will struggle to see it. */
export function hardToSee(d: number, visibility: number) {
  return Math.exp((-3 * d) / Math.max(1, visibility)) < 0.25
}

export function LabelDriver({ refs, kinds }: { refs: RefObject<LabelRefs>; kinds: RefObject<Map<string, Kind>> }) {
  const f = useFrameRef()
  const fx = useFx()
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  const w = useMemo(() => new THREE.Vector3(), [])
  const base = useRef<number | null>(null)

  const screen = (x: number, y: number, h: number) => {
    v.set(...toWorld(x, y, h)).project(camera)
    return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, behind: v.z > 1 }
  }

  useFrame(() => {
    const fr = f.current
    const L = refs.current
    if (!fr || !L) return
    const m = fr.machine
    const vis = fr.conditions.visibility_m

    for (const [id, el] of L.objects) {
      const o = fr.objects.find((x) => x.id === id)
      if (!o) { el.root.style.opacity = '0'; continue }
      const kind = kinds.current?.get(id) ?? 'object'
      const p = screen(o.x, o.y, kind === 'worker' ? 2.3 : 3.3)
      const inside = p.x > EDGE && p.x < size.width - EDGE && p.y > EDGE && p.y < size.height - EDGE && !p.behind
      let x = p.x, y = p.y
      if (!inside) {
        // Pin to the edge, arrow pointing at where it really is.
        const c = screen(m.x, m.y, 0)
        const ang = Math.atan2(p.y - c.y, p.x - c.x)
        const kx = (size.width / 2 - EDGE) / Math.max(1e-3, Math.abs(Math.cos(ang)))
        const ky = (size.height / 2 - EDGE) / Math.max(1e-3, Math.abs(Math.sin(ang)))
        const k = Math.min(kx, ky)
        x = size.width / 2 + Math.cos(ang) * k
        y = size.height / 2 + Math.sin(ang) * k + 12
        el.arrow.style.transform = `rotate(${ang}rad)`
      }
      // Keep the whole label on screen (it is anchored at its bottom centre).
      const hw = el.root.offsetWidth / 2 + 6
      x = Math.min(size.width - hw, Math.max(hw, x))
      y = Math.min(size.height - 6, Math.max(el.root.offsetHeight + 6, y))
      el.root.dataset.edge = inside ? '0' : '1'
      el.root.style.opacity = '1'
      el.root.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
      const d = Math.hypot(o.x - m.x, o.y - m.y)
      const a = fr.active_alert
      const tier = a && a.object_id === o.id && a.tier !== 'log' ? a.tier : null
      const t = o.t_cpa_s
      const soon = t != null && t <= 10 && (o.d_cpa_m ?? 99) < fr.zones.outer_m * 1.5
      setText(el.main, `${KIND_LABEL[kind]} · ${d < 10 ? d.toFixed(1) : Math.round(d)} m`)
      const notes: string[] = []
      if (soon) notes.push(`closest in ${t!.toFixed(1)} s`)
      if (vis < 1000 && hardToSee(d, vis)) notes.push('hard to see · tracked')
      setText(el.sub, notes.join(' · '))
      el.sub.style.display = notes.length ? '' : 'none'
      el.root.dataset.tier = tier ?? (soon ? 'watch' : 'none')
    }

    // Ring distances, on one bearing so they read as a scale.
    const radii = [fr.zones.inner_m, fr.zones.warn_m, fr.zones.outer_m]
    const rad = bearingToMathRad(RING_BEARING)
    L.rings.forEach((el, i) => {
      if (!el) return
      const r = radii[i]
      const p = screen(m.x + Math.cos(rad) * r, m.y + Math.sin(rad) * r, 0.05)
      el.style.transform = `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`
      setText(el, `${Math.abs(r - Math.round(r)) < 0.05 ? Math.round(r) : r.toFixed(1)} m`)
    })

    // Zones widen in bad conditions (M1 scales them); say so, next to the rings.
    if (base.current == null || fr.zones.inner_m < base.current) base.current = fr.zones.inner_m
    if (L.growth) {
      const g = fr.zones.inner_m / (base.current || fr.zones.inner_m)
      const show = g > 1.04
      L.growth.style.opacity = show ? '1' : '0'
      if (show) {
        const rb = bearingToMathRad(150)
        const p = screen(m.x + Math.cos(rb) * fr.zones.outer_m, m.y + Math.sin(rb) * fr.zones.outer_m, 0.05)
        L.growth.style.transform = `translate(-10%, 0) translate(${p.x}px, ${p.y}px)`
        const why = fr.conditions.ground !== 'dry' ? `${fr.conditions.ground} ground, μ ${fr.conditions.mu.toFixed(2)}` : `visibility ${Math.round(vis)} m`
        setText(L.growth, `Zones +${Math.round((g - 1) * 100)}% · ${why}`)
      }
    }

    if (L.inhibit) {
      L.inhibit.style.opacity = fr.motion_inhibit ? '1' : '0'
      const p = screen(m.x, m.y, 5.2)
      L.inhibit.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`
    }

    // Compass: which way north is on screen. Shown mostly from above.
    if (L.compass) {
      const a = screen(m.x, m.y, 0)
      w.set(...toWorld(m.x, m.y + 10, 0)).project(camera)
      const bx = ((w.x + 1) / 2) * size.width, by = ((1 - w.y) / 2) * size.height
      const ang = Math.atan2(bx - a.x, -(by - a.y))
      ;(L.compass.firstElementChild as HTMLElement | null)?.style.setProperty('transform', `rotate(${ang}rad)`)
      L.compass.style.opacity = String(1 - fx.current.view * 0.5)
    }
  })
  return null
}
