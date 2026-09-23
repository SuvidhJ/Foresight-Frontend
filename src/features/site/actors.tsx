/**
 * Tracked objects: body, dashed predicted path and closest-approach marker.
 * Bodies ignore scene fog on purpose: the sensors still see what the operator can't.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { bearingOf, bearingToRotY, toWorld } from '@/lib/geo'
import { COLORS, damp, tierOf, useFrameRef, useFx, type Kind } from './scene'

type Mat = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
type Tint = (i: number) => (m: Mat | null) => void

const DASH_LEN = 0.5
const DASH_GAP = 0.32
const MAX_DASHES = 48
const dashObj = new THREE.Object3D()
const Y = new THREE.Vector3(0, 1, 0)

/**
 * Predicted path as flat dashes laid along the polyline (instanced, one draw call).
 * drei's <Line> did not redraw after its points changed, so paths are meshes instead.
 */
function layoutDashes(mesh: THREE.InstancedMesh, pts: [number, number][], color: string) {
  let n = 0
  for (let i = 0; i + 1 < pts.length && n < MAX_DASHES; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    const len = Math.hypot(bx - ax, by - ay)
    if (len < 1e-3) continue
    const rot = bearingToRotY(bearingOf(bx - ax, by - ay))
    for (let d = DASH_LEN / 2; d < len && n < MAX_DASHES; d += DASH_LEN + DASH_GAP) {
      const k = d / len
      dashObj.position.set(...toWorld(ax + (bx - ax) * k, ay + (by - ay) * k, 0.07))
      dashObj.rotation.set(-Math.PI / 2, 0, 0)
      dashObj.rotateOnWorldAxis(Y, rot)
      // Dashes fade along the path: the further ahead, the less certain.
      const s = 1 - (i / Math.max(1, pts.length - 1)) * 0.55
      dashObj.scale.set(s, 1, 1)
      dashObj.updateMatrix()
      mesh.setMatrixAt(n++, dashObj.matrix)
    }
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  ;(mesh.material as THREE.MeshBasicMaterial).color.set(color)
}

export function ObjectMarker({ id, kind }: { id: string; kind: Kind }) {
  const f = useFrameRef()
  const body = useRef<THREE.Group>(null)
  const dashes = useRef<THREE.InstancedMesh>(null)
  const cpaMark = useRef<THREE.Group>(null)
  const ping = useRef<THREE.Mesh>(null)
  const mats = useRef<Mat[]>([])
  const legs = useRef<THREE.Group[]>([])
  const wheels = useRef<THREE.Mesh[]>([])
  const fill = useRef<THREE.Mesh>(null)
  const beams = useRef<THREE.Mesh>(null)
  const fx = useFx()
  const st = useMemo(() => ({ key: '', heading: kind === 'haul_truck' ? 90 : 0, phase: 0, last: new THREE.Vector2(NaN, NaN), color: '' }), [kind])

  useFrame(({ clock }, dt) => {
    const fr = f.current
    const o = fr?.objects.find((x) => x.id === id)
    if (!fr || !o || !body.current) {
      if (body.current) body.current.visible = false
      if (dashes.current) dashes.current.count = 0
      if (cpaMark.current) cpaMark.current.visible = false
      return
    }
    body.current.visible = true
    body.current.position.set(...toWorld(o.x, o.y))
    const speed = Math.hypot(o.vx, o.vy)
    if (speed > 0.1) st.heading = bearingOf(o.vx, o.vy)
    body.current.rotation.y = bearingToRotY(st.heading)

    // Walking gait and rolling wheels from the reported speed.
    const moved = Number.isNaN(st.last.x) ? 0 : Math.hypot(o.x - st.last.x, o.y - st.last.y)
    st.last.set(o.x, o.y)
    st.phase += Math.min(moved, 1) * (kind === 'worker' ? 5.2 : 1 / 0.45)
    if (kind === 'worker') legs.current.forEach((g, i) => { if (g) g.rotation.x = Math.sin(st.phase + (i % 2) * Math.PI) * (speed > 0.1 ? 0.55 : 0) * (i < 2 ? 1 : -0.8) })
    else wheels.current.forEach((w) => { if (w) w.rotation.x = -st.phase })
    if (fill.current) {
      const k = fx.current.truckFill
      fill.current.visible = k > 0.01
      fill.current.scale.set(1, damp(fill.current.scale.y, Math.max(0.05, k), 3, dt), 1)
    }
    if (beams.current) beams.current.visible = fr.conditions.visibility_m < 400 && speed > 0.1

    const tier = tierOf(o, fr)
    const color = tier ? COLORS[tier] : COLORS.neutral
    if (color !== st.color) {
      st.color = color
      mats.current.forEach((m) => m?.color.set(color))
    }

    const pts = o.predicted_path ?? []
    const key = pts.map((p) => p.join(',')).join(';') + color
    if (dashes.current && key !== st.key) {
      st.key = key
      layoutDashes(dashes.current, pts, tier ? color : COLORS.ring)
    }

    // Closest-approach marker: where this object is predicted to be nearest the machine.
    const pulse = Math.sin(clock.elapsedTime * 6)
    if (cpaMark.current) {
      const show = o.t_cpa_s != null && o.t_cpa_s <= 10 && (o.d_cpa_m ?? 99) < fr.zones.outer_m * 1.5
      cpaMark.current.visible = show
      if (show) {
        const t = o.t_cpa_s!
        cpaMark.current.position.set(...toWorld(o.x + o.vx * t, o.y + o.vy * t, 0.08))
        cpaMark.current.scale.setScalar(0.9 + pulse * 0.08)
        cpaMark.current.children.forEach((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(tier ? color : COLORS.cyan))
      }
    }
    // People always get a slow ping, so they stand out on a busy site.
    if (ping.current) {
      const k = (clock.elapsedTime * 0.8 + id.length * 0.37) % 1
      ping.current.scale.setScalar(0.9 + k * 1.6)
      ;(ping.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (tier ? 0.8 : 0.45)
      ;(ping.current.material as THREE.MeshBasicMaterial).color.set(tier ? color : COLORS.neutral)
    }
  })

  const tint: Tint = (i) => (m) => { if (m) mats.current[i] = m }
  const leg = (i: number) => (g: THREE.Group | null) => { if (g) legs.current[i] = g }
  const wheel = (i: number) => (m: THREE.Mesh | null) => { if (m) wheels.current[i] = m }

  return (
    <>
      <group ref={body} visible={false}>
        {kind === 'worker' && (
          <>
            <mesh ref={ping} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
              <ringGeometry args={[0.85, 1, 40]} />
              <meshBasicMaterial color={COLORS.neutral} transparent opacity={0.4} depthWrite={false} fog={false} />
            </mesh>
            <Worker tint={tint} leg={leg} />
          </>
        )}
        {kind === 'haul_truck' && <HaulTruck tint={tint} wheel={wheel} fill={fill} />}
        {kind === 'light_vehicle' && <Pickup tint={tint} wheel={wheel} beams={beams} />}
        {kind === 'object' && (
          <mesh position={[0, 0.5, 0]} castShadow>
            <coneGeometry args={[0.4, 1, 16]} />
            <meshStandardMaterial ref={tint(0)} color={COLORS.neutral} fog={false} />
          </mesh>
        )}
      </group>
      <instancedMesh ref={dashes} args={[undefined, undefined, MAX_DASHES]} frustumCulled={false}>
        <planeGeometry args={[0.2, DASH_LEN]} />
        <meshBasicMaterial color={COLORS.ring} transparent opacity={0.95} depthWrite={false} side={THREE.DoubleSide} fog={false} />
      </instancedMesh>
      <group ref={cpaMark} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.62, 0.8, 32]} />
          <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.95} depthWrite={false} fog={false} />
        </mesh>
        {[0, Math.PI / 2].map((r) => (
          <mesh key={r} rotation={[-Math.PI / 2, 0, r + Math.PI / 4]}>
            <planeGeometry args={[1.5, 0.12]} />
            <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.95} depthWrite={false} fog={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </>
  )
}

/** Hard hat, hi-vis vest, walking legs. The ground disc is what reads from straight above. */
function Worker({ tint, leg }: { tint: Tint; leg: (i: number) => (g: THREE.Group | null) => void }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[0.8, 32]} />
        <meshBasicMaterial ref={tint(0)} color={COLORS.neutral} transparent opacity={0.6} depthWrite={false} fog={false} />
      </mesh>
      {[-0.13, 0.13].map((x, i) => (
        <group key={x} ref={leg(i)} position={[x, 0.9, 0]}>
          <mesh position={[0, -0.45, 0]} castShadow>
            <boxGeometry args={[0.17, 0.9, 0.2]} />
            <meshStandardMaterial color="#2c3440" fog={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.22, 0]} castShadow>
        <boxGeometry args={[0.5, 0.66, 0.3]} />
        <meshStandardMaterial ref={tint(1)} color={COLORS.neutral} roughness={0.5} fog={false} />
      </mesh>
      {/* reflective vest stripes */}
      <mesh position={[0, 1.12, 0]}>
        <boxGeometry args={[0.52, 0.06, 0.32]} />
        <meshStandardMaterial color="#f4f7fa" emissive="#9aa6b2" emissiveIntensity={0.6} fog={false} />
      </mesh>
      {[-0.31, 0.31].map((x, i) => (
        <group key={x} ref={leg(i + 2)} position={[x, 1.5, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <boxGeometry args={[0.12, 0.6, 0.14]} />
            <meshStandardMaterial ref={tint(2 + i)} color={COLORS.neutral} fog={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.7, 0]} castShadow>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial color="#c89b7b" fog={false} />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} fog={false} />
      </mesh>
    </>
  )
}

/** Articulated haul truck; the bed fills as the excavator dumps into it. */
function HaulTruck({ tint, wheel, fill }: { tint: Tint; wheel: (i: number) => (m: THREE.Mesh | null) => void; fill: React.RefObject<THREE.Mesh | null> }) {
  return (
    <group>
      {[[-1.15, -1.7], [1.15, -1.7], [-1.15, 0.9], [1.15, 0.9], [-1.15, 2.1], [1.15, 2.1]].map(([x, z], i) => (
        <mesh key={i} ref={wheel(i)} position={[x, 0.62, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.62, 0.62, 0.5, 18]} />
          <meshStandardMaterial color="#1a1d21" roughness={0.95} fog={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, 0.4]} castShadow>
        <boxGeometry args={[1.4, 0.35, 4.6]} />
        <meshStandardMaterial color="#2d3238" fog={false} />
      </mesh>
      {/* cab + engine at the front (-z) */}
      <mesh position={[0, 1.45, -1.9]} castShadow>
        <boxGeometry args={[2.3, 1.0, 1.4]} />
        <meshStandardMaterial ref={tint(0)} color={COLORS.neutral} roughness={0.55} fog={false} />
      </mesh>
      <mesh position={[-0.55, 2.35, -1.95]} castShadow>
        <boxGeometry args={[1.0, 0.85, 1.1]} />
        <meshStandardMaterial ref={tint(1)} color={COLORS.neutral} roughness={0.55} fog={false} />
      </mesh>
      <mesh position={[-0.55, 2.4, -2.51]}>
        <boxGeometry args={[0.85, 0.5, 0.02]} />
        <meshStandardMaterial color="#7fa8c0" roughness={0.1} metalness={0.4} fog={false} />
      </mesh>
      {/* bed */}
      <group position={[0, 1.55, 1.05]}>
        <mesh position={[0, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.5, 0.12, 3.2]} />
          <meshStandardMaterial ref={tint(2)} color={COLORS.neutral} roughness={0.6} fog={false} />
        </mesh>
        {[[-1.2, 0, 0.1, 3.2], [1.2, 0, 0.1, 3.2]].map(([x, , w, d], i) => (
          <mesh key={i} position={[x, 0.5, 0]} castShadow>
            <boxGeometry args={[w, 1.0, d]} />
            <meshStandardMaterial ref={tint(3 + i)} color={COLORS.neutral} roughness={0.6} fog={false} />
          </mesh>
        ))}
        <mesh position={[0, 0.55, -1.6]} castShadow>
          <boxGeometry args={[2.5, 1.1, 0.1]} />
          <meshStandardMaterial ref={tint(5)} color={COLORS.neutral} roughness={0.6} fog={false} />
        </mesh>
        <mesh ref={fill} position={[0, 0.06, 0]} scale={[1, 0.05, 1]} visible={false}>
          <sphereGeometry args={[1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#6b5237" roughness={1} fog={false} />
        </mesh>
      </group>
    </group>
  )
}

/** Site light vehicle. Headlight beams show in low visibility. */
function Pickup({ tint, wheel, beams }: { tint: Tint; wheel: (i: number) => (m: THREE.Mesh | null) => void; beams: React.RefObject<THREE.Mesh | null> }) {
  return (
    <group>
      {[[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]].map(([x, z], i) => (
        <mesh key={i} ref={wheel(i)} position={[x, 0.38, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.3, 16]} />
          <meshStandardMaterial color="#15181b" fog={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[1.85, 0.6, 4.6]} />
        <meshStandardMaterial ref={tint(0)} color={COLORS.neutral} roughness={0.35} metalness={0.2} fog={false} />
      </mesh>
      <mesh position={[0, 1.35, -0.45]} castShadow>
        <boxGeometry args={[1.75, 0.65, 1.9]} />
        <meshStandardMaterial ref={tint(1)} color={COLORS.neutral} roughness={0.35} metalness={0.2} fog={false} />
      </mesh>
      <mesh position={[0, 1.37, -1.41]}>
        <boxGeometry args={[1.6, 0.5, 0.02]} />
        <meshStandardMaterial color="#6d8ea3" roughness={0.1} metalness={0.4} fog={false} />
      </mesh>
      {[-0.65, 0.65].map((x) => (
        <mesh key={x} position={[x, 0.85, -2.31]}>
          <boxGeometry args={[0.35, 0.16, 0.02]} />
          <meshBasicMaterial color="#fff6d8" fog={false} />
        </mesh>
      ))}
      <mesh ref={beams} position={[0, 0.8, -6.3]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
        <coneGeometry args={[1.9, 8, 20, 1, true]} />
        <meshBasicMaterial color="#fff3c4" transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} fog={false} />
      </mesh>
    </group>
  )
}
