/**
 * Ground overlays around the machine: zone rings, where the boom will sweep next, which
 * direction the hazard is in, and the sensor sweep (stronger when the operator can't see far).
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import { bearingOf, bearingToMathRad, clamp, toWorld } from '@/lib/geo'
import { COLORS, useFrameRef } from './scene'

const UNIT_CIRCLE: [number, number, number][] = Array.from({ length: 129 }, (_, i) => {
  const a = (i / 128) * Math.PI * 2
  return [Math.cos(a), 0, Math.sin(a)]
})

/** Three zone rings, neutral unless an alert involves that zone. */
export function Zones() {
  const f = useFrameRef()
  const g = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const warn = useRef<THREE.Group>(null)
  const outer = useRef<THREE.Group>(null)
  const innerLine = useRef<Line2>(null)
  const warnLine = useRef<Line2>(null)
  const disc = useRef<THREE.Mesh>(null)
  const band = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const fr = f.current
    if (!fr || !g.current) return
    g.current.position.set(...toWorld(fr.machine.x, fr.machine.y, 0.03))
    inner.current?.scale.setScalar(fr.zones.inner_m)
    warn.current?.scale.setScalar(fr.zones.warn_m)
    outer.current?.scale.setScalar(fr.zones.outer_m)
    const tier = fr.active_alert?.type === 'proximity' ? fr.active_alert.tier : null
    const pulse = Math.sin(clock.elapsedTime * 8)
    const im = innerLine.current?.material
    const wm = warnLine.current?.material
    if (im) { im.color.set(tier === 'hard' ? COLORS.hard : COLORS.ring); im.opacity = tier === 'hard' ? 1 : 0.6; im.linewidth = tier === 'hard' ? 4 : 2 }
    if (wm) { wm.color.set(tier === 'soft' ? COLORS.soft : COLORS.ring); wm.opacity = tier === 'soft' ? 1 : 0.45; wm.linewidth = tier === 'soft' ? 3.5 : 1.6 }
    if (disc.current) {
      disc.current.visible = tier === 'hard'
      disc.current.scale.setScalar(fr.zones.inner_m)
      ;(disc.current.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.07
    }
    // Soft: the band between the inner and warning rings glows amber.
    if (band.current) {
      band.current.visible = tier === 'soft'
      band.current.scale.setScalar(fr.zones.warn_m)
      ;(band.current.material as THREE.MeshBasicMaterial).opacity = 0.09 + Math.sin(clock.elapsedTime * 3) * 0.04
    }
  })
  return (
    <group ref={g}>
      <mesh ref={disc} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1, 64]} />
        <meshBasicMaterial color={COLORS.hard} transparent opacity={0.15} depthWrite={false} fog={false} />
      </mesh>
      <mesh ref={band} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 1, 64]} />
        <meshBasicMaterial color={COLORS.soft} transparent opacity={0.1} depthWrite={false} fog={false} />
      </mesh>
      <group ref={inner}><Line ref={innerLine} points={UNIT_CIRCLE} color={COLORS.ring} lineWidth={2} transparent opacity={0.6} fog={false} /></group>
      <group ref={warn}><Line ref={warnLine} points={UNIT_CIRCLE} color={COLORS.ring} lineWidth={1.6} transparent opacity={0.45} fog={false} /></group>
      <group ref={outer}><Line points={UNIT_CIRCLE} color={COLORS.ring} lineWidth={1.2} transparent opacity={0.3} dashed dashSize={0.02} gapSize={0.015} fog={false} /></group>
    </group>
  )
}

/**
 * Where the boom will sweep in the next 3 s, as a translucent fan. It turns amber or red when
 * the sweep heads towards the object the active alert is about: the motion that is dangerous.
 */
export function SwingFan({ seconds = 3 }: { seconds?: number }) {
  const f = useFrameRef()
  const mesh = useRef<THREE.Mesh>(null)
  const N = 24
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 2) * 3), 3))
    const idx: number[] = []
    for (let i = 1; i <= N; i++) idx.push(0, i, i + 1)
    g.setIndex(idx)
    return g
  }, [])
  useFrame(() => {
    const fr = f.current
    if (!fr || !mesh.current) return
    const m = fr.machine
    const sweep = m.swing_rate_dps * seconds
    mesh.current.visible = Math.abs(sweep) > 4 && !fr.motion_inhibit
    const pos = geom.attributes.position as THREE.BufferAttribute
    const r = m.boom_reach_m + 0.8
    pos.setXYZ(0, 0, 0, 0)
    for (let i = 0; i <= N; i++) {
      const a = bearingToMathRad(m.swing_deg + (sweep * i) / N)
      pos.setXYZ(i + 1, Math.cos(a) * r, 0, -Math.sin(a) * r)
    }
    pos.needsUpdate = true
    geom.computeBoundingSphere()
    mesh.current.position.set(...toWorld(m.x, m.y, 0.05))
    const a = fr.active_alert
    const o = a?.object_id ? fr.objects.find((x) => x.id === a.object_id) : null
    let color = COLORS.cyan
    if (a && o && a.tier !== 'log') {
      const rel = ((bearingOf(o.x - m.x, o.y - m.y) - m.swing_deg + 540) % 360) - 180
      if (Math.sign(rel) === Math.sign(sweep)) color = COLORS[a.tier]
    }
    const mat = mesh.current.material as THREE.MeshBasicMaterial
    mat.color.set(color)
    mat.opacity = color === COLORS.cyan ? 0.14 : 0.26
  })
  return (
    <mesh ref={mesh} geometry={geom}>
      <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} fog={false} />
    </mesh>
  )
}

/** A wedge on the zone band pointing at the object the active alert is about. */
export function HazardSector() {
  const f = useFrameRef()
  const g = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const HALF = 0.26
  useFrame(({ clock }) => {
    const fr = f.current
    if (!fr || !g.current) return
    const a = fr.active_alert
    const o = a?.object_id ? fr.objects.find((x) => x.id === a.object_id) : null
    g.current.visible = !!(a && o && a.tier !== 'log')
    if (!a || !o || a.tier === 'log') return
    const m = fr.machine
    g.current.position.set(...toWorld(m.x, m.y, 0.04))
    g.current.rotation.y = bearingToMathRad(bearingOf(o.x - m.x, o.y - m.y))
    g.current.scale.setScalar(fr.zones.outer_m * 1.08)
    if (mat.current) {
      mat.current.color.set(COLORS[a.tier])
      mat.current.opacity = (a.tier === 'hard' ? 0.5 : 0.36) + Math.sin(clock.elapsedTime * (a.tier === 'hard' ? 9 : 4)) * 0.12
    }
  })
  return (
    <group ref={g} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 1, 32, 1, -HALF, HALF * 2]} />
        <meshBasicMaterial ref={mat} color={COLORS.soft} transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} fog={false} />
      </mesh>
    </group>
  )
}

/**
 * Sensor sweep around the machine: a faint rotating beam. It is stronger when visibility is
 * low, the moment the display is telling the operator "we can see what you can't".
 */
export function SensorSweep() {
  const f = useFrameRef()
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uAngle: { value: 0 }, uStrength: { value: 0.3 }, uColor: { value: new THREE.Color(COLORS.cyan) } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          uniform float uAngle; uniform float uStrength; uniform vec3 uColor; varying vec2 vP;
          void main(){
            float r = length(vP);
            float a = atan(vP.y, vP.x);
            float d = mod(uAngle - a, 6.28318);
            float beam = exp(-d * 4.5) * smoothstep(1.0, 0.8, r) * smoothstep(0.1, 0.3, r);
            float edge = smoothstep(0.012, 0.0, abs(r - 0.995)) * 0.5;
            gl_FragColor = vec4(uColor, (beam * 0.5 + edge * 0.35) * uStrength);
          }`,
      }),
    [],
  )
  useFrame(({ clock }) => {
    const fr = f.current
    if (!fr || !mesh.current) return
    mesh.current.position.set(...toWorld(fr.machine.x, fr.machine.y, 0.035))
    const R = fr.zones.outer_m * 2
    mesh.current.scale.setScalar(R)
    mat.uniforms.uAngle.value = (clock.elapsedTime * 2.2) % (Math.PI * 2)
    const low = 1 - clamp((fr.conditions.visibility_m - 40) / 400, 0, 1)
    mat.uniforms.uStrength.value = 0.25 + low * 0.35
  })
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={2}>
      <circleGeometry args={[1, 96]} />
    </mesh>
  )
}
