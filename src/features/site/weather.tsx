/**
 * Weather, driven only by LiveFrame.conditions:
 *   - light: overcast dims the sun as rain and fog come in;
 *   - fog: in 3D, scene fog whose far distance follows the reported visibility; from above,
 *     a ground layer whose opacity grows with distance as 1 - exp(-3d/V) (Koschmieder: 5%
 *     contrast left at the reported visibility V), with drifting patches so it reads as fog;
 *   - rain: slanted streaks, plus ripples on the ground so rain also reads from straight above.
 * Tracked objects ignore fog: the sensors still see what the operator can't.
 */
import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { clamp, toWorld } from '@/lib/geo'
import { damp, useFrameRef, useFx } from './scene'

const BG = new THREE.Color('#0a0e13')
const FOG = new THREE.Color('#4d5864')

/** 0 = clear, 1 = thick fog, from visibility in metres. */
export function fogAmount(visibility: number) {
  return 1 - clamp((visibility - 40) / 460, 0, 1)
}

export function Atmosphere() {
  const f = useFrameRef()
  const fx = useFx()
  const { scene, camera } = useThree()
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const st = useMemo(() => ({ fog: new THREE.Fog(BG.clone(), 1000, 2000), bg: BG.clone(), k: 0, wet: 0 }), [])

  useFrame((_, dt) => {
    const fr = f.current
    if (!fr) return
    scene.fog = st.fog
    scene.background = st.bg
    const c = fr.conditions
    st.k = damp(st.k, fogAmount(c.visibility_m), 1.5, dt)
    st.wet = damp(st.wet, clamp(c.rain_mm_h / 5, 0, 1), 1.5, dt)
    const [mx, , mz] = toWorld(fr.machine.x, fr.machine.y)
    const camDist = Math.hypot(camera.position.x - mx, camera.position.y, camera.position.z - mz)
    // Fog starts at the machine and is complete about 1.6 V beyond it.
    st.fog.near = camDist - 4
    st.fog.far = camDist + Math.max(18, c.visibility_m * 1.6)
    st.fog.color.copy(BG).lerp(FOG, st.k)
    // The sky only shows in 3D; there it fades into the fog colour.
    st.bg.copy(BG).lerp(FOG, st.k * 0.85 * fx.current.view)
    const dim = Math.max(st.k, st.wet)
    if (hemi.current) hemi.current.intensity = 1.05 - dim * 0.35
    if (sun.current) {
      sun.current.intensity = 2.1 - dim * 1.4
      const [x, , z] = toWorld(fr.machine.x, fr.machine.y)
      sun.current.position.set(x + 14, 30, z + 9)
      sun.current.target.position.set(x, 0, z)
      sun.current.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#dbe7f3', '#2a2118', 1.05]} />
      <directionalLight
        ref={sun}
        position={[14, 30, 9]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  )
}

/** Ground fog seen from above. Drawn under objects and overlays; above the terrain. */
export function FogLayer() {
  const f = useFrameRef()
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uCenter: { value: new THREE.Vector2() }, uVis: { value: 2000 }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#8a96a3') } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `
          uniform vec2 uCenter; uniform float uVis; uniform float uTime; uniform vec3 uColor; varying vec3 vW;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
          void main(){
            float d = distance(vW.xz, uCenter);
            float base = 1.0 - exp(-3.0 * d / uVis);
            vec2 q = vW.xz * 0.07 + vec2(uTime * 0.05, uTime * 0.018);
            float patches = fbm(q + fbm(q * 0.7 - uTime * 0.02));
            float thick = clamp(1.0 - (uVis - 40.0) / 460.0, 0.0, 1.0);
            float a = base * (0.7 + 0.45 * patches) * 0.85 + thick * patches * 0.12;
            gl_FragColor = vec4(uColor * (0.85 + patches * 0.3), clamp(a, 0.0, 0.92));
          }`,
      }),
    [],
  )
  useFrame(({ clock }) => {
    const fr = f.current
    if (!fr) return
    const [x, , z] = toWorld(fr.machine.x, fr.machine.y)
    mat.uniforms.uCenter.value.set(x, z)
    mat.uniforms.uVis.value = Math.max(5, fr.conditions.visibility_m)
    mat.uniforms.uTime.value = clock.elapsedTime
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} material={mat} renderOrder={1}>
      <planeGeometry args={[400, 400]} />
    </mesh>
  )
}

const RAIN_N = 2600
const BOX = 44
const TOP_H = 26
const WIND = new THREE.Vector3(2.2, -17, 1.1)

/** Rain streaks around the machine; count follows rain_mm_h. */
export function Rain() {
  const f = useFrameRef()
  const lines = useRef<THREE.LineSegments>(null)
  const { geom, heads } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(RAIN_N * 6)
    const heads = new Float32Array(RAIN_N * 3)
    for (let i = 0; i < RAIN_N; i++) {
      heads[i * 3] = (Math.random() - 0.5) * BOX
      heads[i * 3 + 1] = Math.random() * TOP_H
      heads[i * 3 + 2] = (Math.random() - 0.5) * BOX
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geom: g, heads }
  }, [])
  const len = useMemo(() => WIND.clone().normalize().multiplyScalar(-0.75), [])
  useFrame((_, dt) => {
    const fr = f.current
    if (!fr || !lines.current) return
    const rain = fr.conditions.rain_mm_h
    lines.current.visible = rain > 0.2
    if (rain <= 0.2) return
    const n = Math.floor(RAIN_N * Math.min(1, rain / 7))
    geom.setDrawRange(0, n * 2)
    const [mx, , mz] = toWorld(fr.machine.x, fr.machine.y)
    lines.current.position.set(mx, 0, mz)
    const p = geom.attributes.position as THREE.BufferAttribute
    const d = Math.min(dt, 0.05)
    for (let i = 0; i < n; i++) {
      let x = heads[i * 3] + WIND.x * d
      let y = heads[i * 3 + 1] + WIND.y * d
      let z = heads[i * 3 + 2] + WIND.z * d
      if (y < 0) { y += TOP_H; x = (Math.random() - 0.5) * BOX; z = (Math.random() - 0.5) * BOX }
      heads[i * 3] = x; heads[i * 3 + 1] = y; heads[i * 3 + 2] = z
      p.setXYZ(i * 2, x, y, z)
      p.setXYZ(i * 2 + 1, x + len.x, y + len.y, z + len.z)
    }
    p.needsUpdate = true
  })
  return (
    <lineSegments ref={lines} geometry={geom} visible={false} frustumCulled={false}>
      <lineBasicMaterial color="#b9d4ec" transparent opacity={0.45} depthWrite={false} fog={false} />
    </lineSegments>
  )
}

const SPLASH_N = 420
const splashObj = new THREE.Object3D()

/** Ripples where drops land; additive, so a black instance colour is invisible. */
export function Splashes() {
  const f = useFrameRef()
  const mesh = useRef<THREE.InstancedMesh>(null)
  const drops = useMemo(() => Array.from({ length: SPLASH_N }, () => ({ x: 0, z: 0, age: Math.random(), speed: 1.6 + Math.random() * 1.2 })), [])
  const col = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    const fr = f.current
    const m = mesh.current
    if (!fr || !m) return
    const rain = fr.conditions.rain_mm_h
    m.visible = rain > 0.2
    if (!m.visible) return
    const n = Math.floor(SPLASH_N * Math.min(1, rain / 6))
    const [mx, , mz] = toWorld(fr.machine.x, fr.machine.y)
    for (let i = 0; i < n; i++) {
      const s = drops[i]
      s.age += dt * s.speed
      if (s.age >= 1) {
        s.age -= 1
        s.x = mx + (Math.random() - 0.5) * 50
        s.z = mz + (Math.random() - 0.5) * 50
      }
      splashObj.position.set(s.x, 0.04, s.z)
      splashObj.rotation.set(-Math.PI / 2, 0, 0)
      splashObj.scale.setScalar(0.03 + s.age * 0.2)
      splashObj.updateMatrix()
      m.setMatrixAt(i, splashObj.matrix)
      m.setColorAt(i, col.setScalar((1 - s.age) * 0.32))
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SPLASH_N]} frustumCulled={false} visible={false}>
      <ringGeometry args={[0.6, 1, 16]} />
      <meshBasicMaterial color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
    </instancedMesh>
  )
}

