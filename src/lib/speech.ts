/**
 * Spoken output through the browser's speech engine, restricted to voices installed on the
 * device (localService), because some Windows "Online (Natural)" voices need the internet.
 * Indian English voices are preferred when present (Microsoft Ravi / Heera on Windows).
 */
let chosen: SpeechSynthesisVoice | null | undefined

function pickVoice() {
  if (chosen !== undefined) return chosen
  if (typeof speechSynthesis === 'undefined') return (chosen = null)
  const local = speechSynthesis.getVoices().filter((v) => v.localService && v.lang.startsWith('en'))
  if (!local.length) return null // voices may not be loaded yet; try again next time
  chosen = local.find((v) => v.lang === 'en-IN') ?? local.find((v) => v.lang === 'en-GB') ?? local[0]
  return chosen
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.onvoiceschanged = () => { chosen = undefined }
}

export function speechAvailable() {
  return pickVoice() != null
}

export function speak(text: string, opts: { interrupt?: boolean; rate?: number } = {}) {
  const voice = pickVoice()
  if (!voice) return false
  if (opts.interrupt) speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = opts.rate ?? 1.05
  speechSynthesis.speak(u)
  return true
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
