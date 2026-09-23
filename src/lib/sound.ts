/**
 * Alert sounds, synthesised with Tone.js (no audio files). Soft and hard differ in pattern,
 * not just pitch, following ISO 7731's principle that danger signals must be recognisable:
 *   soft = one two-tone chime; hard = continuous pulsing tone until the hazard clears.
 * Tone is imported lazily on the first user gesture, because browsers block audio before one.
 */
type ToneModule = typeof import('tone')

let Tone: ToneModule | null = null
let hardLoop: { stop: () => void } | null = null

export async function unlockAudio() {
  if (!Tone) Tone = await import('tone')
  await Tone.start()
  return Tone.getContext().state === 'running'
}

export function audioReady() {
  return Tone?.getContext().state === 'running'
}

export function playSoft() {
  if (!Tone || !audioReady()) return
  const synth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.6 } }).toDestination()
  synth.volume.value = -8
  const now = Tone.now()
  synth.triggerAttackRelease('A5', 0.18, now)
  synth.triggerAttackRelease('E5', 0.28, now + 0.22)
  setTimeout(() => synth.dispose(), 1500)
}

export function startHard() {
  if (!Tone || !audioReady() || hardLoop) return
  const T = Tone
  const synth = new T.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.005, decay: 0.05, sustain: 0.8, release: 0.05 } }).toDestination()
  synth.volume.value = -14
  let high = true
  const id = setInterval(() => {
    synth.triggerAttackRelease(high ? 'B5' : 'F5', 0.11)
    high = !high
  }, 140)
  hardLoop = {
    stop: () => {
      clearInterval(id)
      setTimeout(() => synth.dispose(), 300)
    },
  }
}

export function stopHard() {
  hardLoop?.stop()
  hardLoop = null
}
