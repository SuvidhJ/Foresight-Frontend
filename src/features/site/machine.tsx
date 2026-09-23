/**
 * The operator's own excavator, built from primitives (no model files, works offline).
 * Pose comes from the frame: house = swing_deg, reach = boom_reach_m. The bucket height
 * is inferred: loaded → raised to clear the truck, still and empty → digging in the trench.
 * When the load drops, dirt falls from the bucket and the truck under it fills up.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { bearingToRotY, toWorld } from '@/lib/geo'
import { COLORS, damp, setSegment, useFrameRef, useFx } from './scene'

const DARK = '#2a2e33'
const STEEL = '#b8c0c8'
const N_DIRT = 48

export function Excavator() {
  const f = useFrameRef()
  const fx = useFx()
  const root = useRef<THREE.Group>(null)
  const tracks = useRef<THREE.Group>(null)
  const house = useRef<THREE.Group>(null)
  const boom = useRef<THREE.Mesh>(null)
  const stick = useRef<THREE.Mesh>(null)
  const cyl = useRef<THREE.Mesh>(null)
  const bucket = useRef<THREE.Group>(null)
  const load = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  const yellow = useRef<THREE.MeshStandardMaterial[]>([])
  const dirt = useRef<THREE.InstancedMesh>(null)

  const s = useMemo(() => ({
    foot: new THREE.Vector3(0.3, 1.25, -1.0),
    knuckle: new THREE.Vector3(),
    tip: new THREE.Vector3(),
    cylA: new THREE.Vector3(0.3, 0.75, -1.55),
    cylB: new THREE.Vector3(),
    tipY: 1.2,
    pitch: 0,
    wasLoaded: false,
    world: new THREE.Vector3(),
    parts: Array.from({ length: N_DIRT }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 })),
    obj: new THREE.Object3D(),
  }), [])

  useFrame(({ clock }, dt) => {
    const fr = f.current
    if (!fr || !root.current || !tracks.current || !house.current) return
    const m = fr.machine
    root.current.position.set(...toWorld(m.x, m.y))
    tracks.current.rotation.y = bearingToRotY(m.heading_deg)
    house.current.rotation.y = bearingToRotY(m.swing_deg)

    const loaded = m.load_t > 0.05
    const digging = !loaded && Math.abs(m.swing_rate_dps) < 3 && m.motion_commanded
    const targetY = loaded ? 2.5 : digging ? -0.9 : m.motion_commanded ? 1.3 : 0.6
    s.tipY = damp(s.tipY, targetY, 2.5, dt)
    s.pitch = damp(s.pitch, loaded ? -0.9 : digging ? 0.5 : 0, 3, dt)
    const reach = m.boom_reach_m
    s.knuckle.set(0.3, 3.5 + Math.max(0, s.tipY) * 0.35, -Math.max(2.6, reach * 0.52))
    s.tip.set(0.3, s.tipY + 0.55, -reach)
    if (boom.current) setSegment(boom.current, s.foot, s.knuckle)
    if (stick.current) setSegment(stick.current, s.knuckle, s.tip)
    s.cylB.lerpVectors(s.foot, s.knuckle, 0.55)
    if (cyl.current) setSegment(cyl.current, s.cylA, s.cylB)
    if (bucket.current) {
      bucket.current.position.copy(s.tip)
      bucket.current.rotation.x = s.pitch
    }
    if (load.current) load.current.visible = loaded

    // Dump: the load just went to zero. Dirt falls from the bucket; a truck under it fills.
    if (s.wasLoaded && !loaded && bucket.current) {
      bucket.current.getWorldPosition(s.world)
      let spawned = 0
      for (const p of s.parts) {
        if (p.life > 0 || spawned >= 26) continue
        p.p.set(s.world.x + (Math.random() - 0.5) * 0.8, s.world.y - 0.3, s.world.z + (Math.random() - 0.5) * 0.8)
        p.v.set((Math.random() - 0.5) * 0.8, -Math.random() * 1.5, (Math.random() - 0.5) * 0.8)
        p.life = 1
        spawned++
      }
      const truck = fr.objects.find((o) => o.cls === 'vehicle' && Math.hypot(o.vx, o.vy) < 0.1 && Math.hypot(o.x - s.world.x, -o.y - s.world.z) < 5)
      if (truck) fx.current.truckFill = Math.min(1, fx.current.truckFill + 0.22)
    }
    s.wasLoaded = loaded
    if (dirt.current) {
      let n = 0
      for (const p of s.parts) {
        if (p.life <= 0) continue
        p.v.y -= 9.8 * dt
        p.p.addScaledVector(p.v, dt)
        p.life -= dt * 0.9
        if (p.p.y < 0.1) p.life = 0
        s.obj.position.copy(p.p)
        s.obj.scale.setScalar(0.12 + p.life * 0.12)
        s.obj.updateMatrix()
        dirt.current.setMatrixAt(n++, s.obj.matrix)
      }
      dirt.current.count = n
      dirt.current.instanceMatrix.needsUpdate = true
    }

    const inhibited = !!fr.motion_inhibit
    const pulse = 0.5 + Math.sin(clock.elapsedTime * 8) * 0.5
    if (halo.current) {
      halo.current.visible = inhibited
      ;(halo.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + pulse * 0.25
    }
    for (const mat of yellow.current) {
      mat.emissive.set(inhibited ? COLORS.hard : '#000000')
      mat.emissiveIntensity = inhibited ? 0.25 + pulse * 0.35 : 0
    }
  })

  const y = (i: number) => (m: THREE.MeshStandardMaterial | null) => { if (m) yellow.current[i] = m }

  return (
    <>
      <group ref={root}>
        <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} visible={false}>
          <circleGeometry args={[3.2, 48]} />
          <meshBasicMaterial color={COLORS.hard} transparent opacity={0.35} depthWrite={false} />
        </mesh>

        {/* Undercarriage */}
        <group ref={tracks}>
          {[-1.3, 1.3].map((x) => (
            <group key={x} position={[x, 0.42, 0]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[0.72, 0.84, 3.9]} />
                <meshStandardMaterial color={DARK} roughness={0.95} />
              </mesh>
              {[-1.95, 1.95].map((z) => (
                <mesh key={z} position={[0, 0, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.42, 0.42, 0.72, 20]} />
                  <meshStandardMaterial color={DARK} roughness={0.95} />
                </mesh>
              ))}
              {/* track shoes: pale stripes so the tracks read from above */}
              {Array.from({ length: 9 }, (_, i) => (
                <mesh key={i} position={[0, 0.43, -1.8 + i * 0.45]}>
                  <boxGeometry args={[0.74, 0.02, 0.12]} />
                  <meshStandardMaterial color="#454b52" roughness={1} />
                </mesh>
              ))}
            </group>
          ))}
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[1.9, 0.45, 2.4]} />
            <meshStandardMaterial color="#33383e" roughness={0.9} />
          </mesh>
        </group>

        {/* Upper structure */}
        <group ref={house} position={[0, 0.9, 0]}>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[1.05, 1.05, 0.18, 32]} />
            <meshStandardMaterial color="#1f2226" />
          </mesh>
          <RoundedBox args={[2.6, 0.9, 3.0]} radius={0.12} smoothness={3} position={[0, 0.55, 0.25]} castShadow receiveShadow>
            <meshStandardMaterial ref={y(0)} color={COLORS.machine} roughness={0.5} metalness={0.15} />
          </RoundedBox>
          <RoundedBox args={[2.7, 1.0, 0.75]} radius={0.2} smoothness={3} position={[0, 0.62, 1.95]} castShadow>
            <meshStandardMaterial color="#2d3136" roughness={0.6} />
          </RoundedBox>
          <mesh position={[0.5, 1.1, 0.85]} castShadow>
            <boxGeometry args={[1.45, 0.3, 1.5]} />
            <meshStandardMaterial ref={y(1)} color="#dcae22" roughness={0.55} />
          </mesh>
          <mesh position={[0.95, 1.55, 0.55]}>
            <cylinderGeometry args={[0.08, 0.08, 0.7, 10]} />
            <meshStandardMaterial color="#111" roughness={0.4} />
          </mesh>
          {/* Cab: dark frame, glass, yellow roof */}
          <mesh position={[-0.7, 1.62, -0.45]} castShadow>
            <boxGeometry args={[1.0, 1.4, 1.35]} />
            <meshStandardMaterial color="#1c2024" roughness={0.5} />
          </mesh>
          <mesh position={[-0.7, 1.72, -1.13]}>
            <boxGeometry args={[0.86, 1.05, 0.02]} />
            <meshStandardMaterial color="#7fa8c0" roughness={0.08} metalness={0.4} emissive="#1b3140" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[-1.21, 1.72, -0.45]}>
            <boxGeometry args={[0.02, 1.0, 1.15]} />
            <meshStandardMaterial color="#7fa8c0" roughness={0.08} metalness={0.4} emissive="#1b3140" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[-0.7, 2.35, -0.45]} castShadow>
            <boxGeometry args={[1.06, 0.08, 1.42]} />
            <meshStandardMaterial ref={y(2)} color={COLORS.machine} roughness={0.5} />
          </mesh>

          {/* Front linkage */}
          <mesh ref={boom} castShadow>
            <boxGeometry args={[0.46, 0.62, 1]} />
            <meshStandardMaterial ref={y(3)} color={COLORS.machine} roughness={0.45} metalness={0.15} />
          </mesh>
          <mesh ref={cyl} castShadow>
            <boxGeometry args={[0.16, 0.16, 1]} />
            <meshStandardMaterial color={STEEL} roughness={0.25} metalness={0.8} />
          </mesh>
          <mesh ref={stick} castShadow>
            <boxGeometry args={[0.34, 0.44, 1]} />
            <meshStandardMaterial ref={y(4)} color={COLORS.machine} roughness={0.45} metalness={0.15} />
          </mesh>
          <group ref={bucket}>
            <mesh position={[0, -0.25, -0.1]} castShadow>
              <boxGeometry args={[1.05, 0.7, 0.85]} />
              <meshStandardMaterial color="#3a3e43" roughness={0.7} metalness={0.3} />
            </mesh>
            {[-0.4, -0.2, 0, 0.2, 0.4].map((x) => (
              <mesh key={x} position={[x, -0.62, -0.5]}>
                <boxGeometry args={[0.1, 0.1, 0.22]} />
                <meshStandardMaterial color="#9aa2aa" metalness={0.6} roughness={0.3} />
              </mesh>
            ))}
            <mesh ref={load} position={[0, 0.12, -0.1]} scale={[1, 0.5, 0.8]} visible={false}>
              <sphereGeometry args={[0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#6b5237" roughness={1} />
            </mesh>
          </group>
        </group>
      </group>
      <instancedMesh ref={dirt} args={[undefined, undefined, N_DIRT]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6b5237" roughness={1} />
      </instancedMesh>
    </>
  )
}
