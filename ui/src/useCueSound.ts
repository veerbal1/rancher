import { useEffect, useRef } from 'react'
import type { Cow } from './useCows'

const RANK: Record<string, number> = { none: 0, audio: 1, vibration: 2, pulse: 3 }
const VOLUME = [0, 0.4, 0.7, 1]

export function useCueSound(cows: Cow[], enabled: boolean) {
  const last = useRef(new Map<string, number>())

  useEffect(() => {
    let loudest = 0
    const next = new Map<string, number>()
    for (const c of cows) {
      const rank = RANK[c.level] ?? 0
      const prev = last.current.get(c.collar_id)
      if (prev !== undefined && rank > prev) loudest = Math.max(loudest, rank)
      next.set(c.collar_id, rank)
    }
    last.current = next

    if (enabled && loudest > 0) {
      const sound = new Audio('/cue.mp3')
      sound.volume = VOLUME[loudest]
      sound.play().catch(() => {})
    }
  }, [cows, enabled])
}
