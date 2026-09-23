/**
 * One perspective camera that flies between two poses:
 *   top-down: straight down from high up with a narrow lens, north up. The ground plane is
 *     parallel to the image, so ground distances are to scale, as on a map;
 *   tilted: from the south-south-west, for the demo stage and replay.
 * In the tilted pose a "director" eases the framing towards the hazard of the active alert,
 * so the machine and whatever it is warning about stay in shot together.
 */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { smoothstep, toWorld } from '@/lib/geo'
import { damp, useFrameRef, useFx, type FrameRef } from './scene'
import { interpolate, type FrameSource } from './interp'

/** Runs first each frame and computes the interpolated frame everyone else draws. */
export function Driver({ source, frameRef }: { source: FrameSource; frameRef: FrameRef }) {
  const fx = useFx()
  useFrame(() => {
    const { prev, cur, k } = source()
    const fr = cur ? interpolate(prev, cur, k) : null
    frameRef.current = fr
    // A new run (or a replay scrubbed backwards) empties the truck again.
    if (fr && (fr.scenario_id !== fx.current.scenario || fr.t + 0.5 < fx.current.lastT)) fx.current.truckFill = 0
    if (fr) { fx.current.lastT = fr.t; fx.current.scenario = fr.scenario_id }
  }, -3)
  return null
}

const TOP = { fov: 24, polar: 0.002, az: 0 }
const TILT = { fov: 40, polar: 0.87, az: -0.35 }

export function CameraRig({ tilted, radius = 17, director = true }: { tilted: boolean; radius?: number; director?: boolean }) {
  const { camera, size } = useThree()
  const f = useFrameRef()
  const fx = useFx()
  const p = useRef(tilted ? 1 : 0)
  const focus = useMemo(() => new THREE.Vector3(), [])
  const aim = useMemo(() => new THREE.Vector3(), [])
  const extra = useRef(0)
  const first = useRef(true)

  useFrame(({ clock }, dt) => {
    const fr = f.current
    const cam = camera as THREE.PerspectiveCamera
    // Linear progress eased with smoothstep: a ~0.9 s flight between poses.
    p.current = Math.min(1, Math.max(0, p.current + (tilted ? 1 : -1) * dt / 0.9))
    const e = smoothstep(p.current)
    fx.current.view = e

    const [mx, , mz] = toWorld(fr?.machine.x ?? 0, fr?.machine.y ?? 0)
    aim.set(mx, 0, mz)
    let want = 0
    const a = fr?.active_alert
    const o = a?.object_id ? fr?.objects.find((x) => x.id === a.object_id) : null
    if (director && o && fr && a!.tier !== 'log') {
      const [ox, , oz] = toWorld(o.x, o.y)
      aim.lerp(new THREE.Vector3(ox, 0, oz), 0.4)
      want = Math.max(0, Math.hypot(ox - mx, oz - mz) * 1.1 - 12)
    }
    if (first.current) { focus.copy(aim); first.current = false }
    // Only the tilted pose follows the hazard; top-down stays centred on the machine at a fixed scale.
    focus.x = damp(focus.x, mx + (aim.x - mx) * e, 2.2, dt)
    focus.z = damp(focus.z, mz + (aim.z - mz) * e, 2.2, dt)
    extra.current = damp(extra.current, want, 1.5, dt)

    const aspect = size.width / Math.max(1, size.height)
    const tanTop = Math.tan((TOP.fov / 2) * (Math.PI / 180))
    const distTop = radius / (tanTop * Math.min(1, aspect))
    const distTilt = (aspect < 1.1 ? 40 : 33) + extra.current
    const fov = TOP.fov + (TILT.fov - TOP.fov) * e
    const dist = distTop + (distTilt - distTop) * e
    const polar = TOP.polar + (TILT.polar - TOP.polar) * e
    const az = TOP.az + (TILT.az + Math.sin(clock.elapsedTime * 0.05) * 0.06 - TOP.az) * e

    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix() }
    cam.position.set(focus.x + Math.sin(polar) * Math.sin(az) * dist, Math.cos(polar) * dist, focus.z + Math.sin(polar) * Math.cos(az) * dist)
    cam.up.set(0, 1, 0)
    cam.lookAt(focus.x, 0.4 * e, focus.z)
  }, -2)
  return null
}
