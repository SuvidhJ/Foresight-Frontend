/**
 * Shared state for the site scene. Every part reads the interpolated frame from FrameContext
 * inside useFrame, so React never re-renders at 10 Hz.
 */
import { createContext, useContext } from 'react'
import * as THREE from 'three'
import type { LiveFrame, TrackedObject } from '@/contract/types'

export const COLORS = {
  soft: '#f5a524',
  hard: '#ef4444',
  neutral: '#e4eaf0',
  ring: '#aab8c6',
  cyan: '#22d3ee',
  haze: '#6b7784',
  /** The operator's own machine. Alerts never use this colour; it is never a hazard. */
  machine: '#f2c230',
  dirt: '#3a3128',
}

export type FrameRef = { current: LiveFrame | null }
export const FrameContext = createContext<FrameRef>({ current: null })
export const useFrameRef = () => useContext(FrameContext)

/** Per-scene effects state: how full the haul truck is, and the camera blend (0 top-down, 1 tilted). */
export interface SceneFx {
  truckFill: number
  lastT: number
  view: number
  scenario: string
}
export const FxContext = createContext<{ current: SceneFx }>({ current: { truckFill: 0, lastT: 0, view: 0, scenario: '' } })
export const useFx = () => useContext(FxContext)

/** What a tracked object is drawn as. The contract only says person / vehicle / object. */
export type Kind = 'worker' | 'haul_truck' | 'light_vehicle' | 'object'

/** A vehicle already parked when first seen is the truck being loaded; one that arrives moving is a light vehicle. */
export function kindOf(o: TrackedObject): Kind {
  if (o.cls === 'person') return 'worker'
  if (o.cls === 'object') return 'object'
  return Math.hypot(o.vx, o.vy) < 0.1 ? 'haul_truck' : 'light_vehicle'
}

export const KIND_LABEL: Record<Kind, string> = { worker: 'Person', haul_truck: 'Truck', light_vehicle: 'Vehicle', object: 'Object' }

/** Colour of a tracked object: amber or red only when the active alert is about it. */
export function tierOf(o: TrackedObject, fr: LiveFrame): 'soft' | 'hard' | null {
  const a = fr.active_alert
  if (a && a.object_id === o.id && a.tier !== 'log') return a.tier
  return null
}

/** Box stretched between two points, updated imperatively. */
const _d = new THREE.Vector3()
const _z = new THREE.Vector3(0, 0, 1)
export function setSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  _d.subVectors(b, a)
  obj.position.copy(a).addScaledVector(_d, 0.5)
  obj.scale.set(1, 1, _d.length())
  obj.quaternion.setFromUnitVectors(_z, _d.normalize())
}

/** Frame-rate independent exponential approach. */
export function damp(cur: number, target: number, rate: number, dt: number) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt))
}
