import { useEffect, useRef, useState } from 'react'
import type { Cow } from '../useCows'

const DURATION_MS = 1000

type Pose = { lng: number; lat: number; heading: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const lerpAngle = (a: number, b: number, t: number) => {
  const diff = ((b - a + 540) % 360) - 180
  return (a + diff * t + 360) % 360
}

export function useSmoothCows(cows: Cow[]) {
  const [shown, setShown] = useState(cows)
  const poses = useRef(new Map<string, Pose>())

  useEffect(() => {
    const from = poses.current
    const start = performance.now()
    let frame = 0

    const step = (now: number) => {
      const t = Math.min((now - start) / DURATION_MS, 1)
      const next = new Map<string, Pose>()
      const moved = cows.map((c) => {
        const a = from.get(c.collar_id) ?? c
        const pose = { lng: lerp(a.lng, c.lng, t), lat: lerp(a.lat, c.lat, t), heading: lerpAngle(a.heading, c.heading, t) }
        next.set(c.collar_id, pose)
        return { ...c, ...pose }
      })
      poses.current = next
      setShown(moved)
      if (t < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [cows])

  return shown
}
