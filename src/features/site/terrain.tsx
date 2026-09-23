/**
 * The site: dirt ground (texture drawn on a canvas at load, no files), the trench being dug
 * north of the machine, its spoil pile, and the haul road the truck stands on. The ground
 * darkens and puddles appear as it gets wet.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp } from '@/lib/geo'
import { damp, useFrameRef } from './scene'

/** Trench footprint in site metres (x east, y north). */
const TRENCH = { x0: -1.4, x1: 1.4, y0: 5.0, y1: 12.5, depth: 1.7 }
const ROAD = { y: -4.6, w: 5.2 }

/** Deterministic pseudo-random, so the ground looks the same on every load. */
function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

function dirtTexture(base: string, speck: [string, string], seed: number, ruts = false) {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  const r = rng(seed)
  g.fillStyle = base
  g.fillRect(0, 0, 512, 512)
  // soft blotches
  for (let i = 0; i < 70; i++) {
    const x = r() * 512, y = r() * 512, rad = 20 + r() * 70
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, r() > 0.5 ? 'rgba(255,240,220,0.035)' : 'rgba(0,0,0,0.07)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // grit
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() > 0.5 ? speck[0] : speck[1]
    const s = r() * 1.8 + 0.4
    g.fillRect(r() * 512, r() * 512, s, s)
  }
  // pebbles
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${150 + r() * 40},${140 + r() * 30},${125 + r() * 25},${0.18 + r() * 0.2})`
    g.beginPath()
    g.ellipse(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 2.2, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  if (ruts) {
    // two tyre ruts along the road
    for (const y of [150, 362]) {
      g.fillStyle = 'rgba(0,0,0,0.22)'
      g.fillRect(0, y - 26, 512, 52)
      for (let x = 0; x < 512; x += 14) {
        g.fillStyle = 'rgba(0,0,0,0.18)'
        g.fillRect(x, y - 24, 6, 48)
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function Terrain() {
  const f = useFrameRef()
  const ground = useRef<THREE.MeshStandardMaterial>(null)
  const road = useRef<THREE.MeshStandardMaterial>(null)
  const puddles = useRef<THREE.Group>(null)
  const wet = useRef(0)

  const { groundGeo, groundTex, roadTex } = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-200, -200); shape.lineTo(200, -200); shape.lineTo(200, 200); shape.lineTo(-200, 200); shape.lineTo(-200, -200)
    const hole = new THREE.Path()
    hole.moveTo(TRENCH.x0, TRENCH.y0); hole.lineTo(TRENCH.x0, TRENCH.y1); hole.lineTo(TRENCH.x1, TRENCH.y1); hole.lineTo(TRENCH.x1, TRENCH.y0); hole.lineTo(TRENCH.x0, TRENCH.y0)
    shape.holes.push(hole)
    const geo = new THREE.ShapeGeometry(shape)
    const gt = dirtTexture('#2b261f', ['rgba(0,0,0,0.25)', 'rgba(210,190,160,0.09)'], 7)
    gt.repeat.set(1 / 9, 1 / 9)
    const rt = dirtTexture('#39332b', ['rgba(0,0,0,0.2)', 'rgba(220,205,180,0.1)'], 11, true)
    rt.repeat.set(40, 1)
    return { groundGeo: geo, groundTex: gt, roadTex: rt }
  }, [])

  // A long, lumpy mound: a flattened hemisphere with its vertices pushed around.
  const { spoil, spoilTex } = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    const r = rng(19)
    const p = g.attributes.position as THREE.BufferAttribute
    const bumps = Array.from({ length: 7 }, () => ({ x: (r() - 0.5) * 1.6, z: (r() - 0.5) * 1.6, a: 0.08 + r() * 0.12 }))
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const lump = bumps.reduce((acc, b) => acc + b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) * 6), 0)
      p.setXYZ(i, x * 1.7, y * (1 + lump * 2.5) * 0.75, z * 3.2)
    }
    g.computeVertexNormals()
    const t = dirtTexture('#5e4d3b', ['rgba(0,0,0,0.3)', 'rgba(230,210,180,0.14)'], 23)
    t.repeat.set(3, 3)
    return { spoil: g, spoilTex: t }
  }, [])

  const puddleSpots = useMemo(() => {
    const r = rng(3)
    return Array.from({ length: 14 }, () => {
      const onRoad = r() > 0.45
      return {
        x: (r() - 0.5) * 50,
        y: onRoad ? ROAD.y + (r() - 0.5) * 3 : (r() - 0.5) * 44,
        sx: 0.8 + r() * 2.2,
        sy: 0.5 + r() * 1.2,
        rot: r() * Math.PI,
      }
    }).filter((p) => Math.hypot(p.x, p.y) > 4.5 && !(p.x > TRENCH.x0 - 1 && p.x < TRENCH.x1 + 1 && p.y > TRENCH.y0 - 1 && p.y < TRENCH.y1 + 1))
  }, [])

  useFrame((_, dt) => {
    const c = f.current?.conditions
    if (!c) return
    const target = clamp(c.rain_mm_h / 3, 0, 1) * 0.6 + (c.ground === 'dry' ? 0 : 0.4)
    wet.current = damp(wet.current, clamp(target, 0, 1), 0.8, dt)
    const w = wet.current
    for (const m of [ground.current, road.current]) {
      if (!m) continue
      m.roughness = 1 - w * 0.55
      m.color.setScalar(1 - w * 0.3)
    }
    if (puddles.current) {
      puddles.current.visible = w > 0.05
      puddles.current.children.forEach((p, i) => {
        const spot = puddleSpots[i]
        p.scale.set(spot.sx * Math.max(0.01, w), spot.sy * Math.max(0.01, w), 1)
      })
    }
  })

  const cx = (TRENCH.x0 + TRENCH.x1) / 2
  const cy = (TRENCH.y0 + TRENCH.y1) / 2
  return (
    <group>
      <mesh geometry={groundGeo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshStandardMaterial ref={ground} map={groundTex} roughness={1} metalness={0} />
      </mesh>
      {/* Haul road, running east-west south of the machine */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, -ROAD.y]} receiveShadow>
        <planeGeometry args={[400, ROAD.w]} />
        <meshStandardMaterial ref={road} map={roadTex} roughness={0.95} />
      </mesh>
      {/* Trench: an open box seen from inside (walls and floor), top at ground level */}
      <mesh position={[cx, -TRENCH.depth / 2, -cy]} receiveShadow>
        <boxGeometry args={[TRENCH.x1 - TRENCH.x0, TRENCH.depth, TRENCH.y1 - TRENCH.y0]} />
        <meshStandardMaterial color="#1a1511" roughness={1} side={THREE.BackSide} />
      </mesh>
      {/* Spoil pile along the west side of the trench */}
      <mesh geometry={spoil} position={[-4.2, 0, -8.8]} castShadow receiveShadow>
        <meshStandardMaterial map={spoilTex} roughness={1} />
      </mesh>
      {/* Edge-protection posts along the trench */}
      {[TRENCH.y0, (TRENCH.y0 + TRENCH.y1) / 2, TRENCH.y1].flatMap((y) => [TRENCH.x0 - 0.5, TRENCH.x1 + 0.5].map((x) => (
        <group key={`${x},${y}`} position={[x, 0, -y]}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
            <meshStandardMaterial color="#e8edf2" />
          </mesh>
          <mesh position={[0, 0.82, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.16, 8]} />
            <meshStandardMaterial color="#8d98a3" />
          </mesh>
        </group>
      )))}
      <group ref={puddles} visible={false}>
        {puddleSpots.map((p, i) => (
          <mesh key={i} position={[p.x, 0.02, -p.y]} rotation={[-Math.PI / 2, 0, p.rot]}>
            <circleGeometry args={[1, 24]} />
            <meshStandardMaterial color="#0e1318" roughness={0.05} metalness={0.9} transparent opacity={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
