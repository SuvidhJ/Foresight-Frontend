/**
 * Plays the sound and spoken sentence when the on-screen alert changes. Exactly one alert is
 * shown at a time (LiveFrame.active_alert); the same alert never re-triggers its sound.
 */
import { useEffect, useRef } from 'react'
import { useLive } from '@/store/live'
import { useAudioGate } from '@/store/session'
import { playSoft, startHard, stopHard } from '@/lib/sound'
import { speak } from '@/lib/speech'
import { spokenAlert } from '@/lib/phrasing'
import { useLevel } from '@/lib/queries'

export function useAlertEffects(enabled = true) {
  const alertKey = useLive((s) => s.alertKey)
  const unlocked = useAudioGate((s) => s.unlocked)
  const level = useLevel()
  const announced = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled || !unlocked) return
    const cur = useLive.getState().cur?.frame ?? null
    const a = cur?.active_alert
    if (!a || a.tier === 'log') {
      stopHard()
      return
    }
    if (a.tier === 'hard') {
      startHard()
    } else {
      stopHard()
    }
    if (!announced.current.has(alertKey)) {
      announced.current.add(alertKey)
      if (a.tier === 'soft') playSoft()
      // An alert always cuts off whatever else is being said (a notice, an answer): it never waits in a queue.
      speak(spokenAlert(a, cur, level), { interrupt: true })
    }
  }, [alertKey, enabled, unlocked, level])

  useEffect(() => () => stopHard(), [])
}
