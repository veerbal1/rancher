import { useEffect, useState } from 'react'
import type { LngLat } from './map/geo'
import type { Cow } from './useCows'

export type Shift = {
  id: string
  farmer_id: string
  from_paddock_id: string
  to_paddock_id: string
  collar_ids: string[]
  path: { type: 'LineString'; coordinates: LngLat[] }
  width_m: number
  start_at: string
  expires_at: string
  session_id?: string
}

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL
const STARTUP_GRACE_MS = 30_000

export function useShifts(farmerId: string | null) {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setShifts([])
    if (!farmerId) return

    let cancelled = false
    fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/shifts`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setShifts(data)
      })
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [farmerId])

  const startShift = async (fromPaddockId: string, toPaddockId: string, path: LngLat[], collarIds?: string[]): Promise<Shift> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/shifts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from_paddock_id: fromPaddockId,
        to_paddock_id: toPaddockId,
        path: { type: 'LineString', coordinates: path },
        collar_ids: collarIds,
      }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setShifts((prev) => [...prev, body])
    return body
  }

  const turnBack = async (shift: Shift): Promise<Shift | null> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(
      `${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/shifts/${encodeURIComponent(shift.id)}/turn-back`,
      { method: 'POST' },
    )
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    const back: Shift | null = body.shift ?? null
    setShifts((prev) => [...prev.filter((s) => s.id !== shift.id), ...(back ? [back] : [])])
    return back
  }

  return { shifts, error, startShift, turnBack }
}

export function useActiveShifts(shifts: Shift[], cows: Cow[]) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const moving = new Set(cows.filter((c) => c.state === 'moving').map((c) => c.collar_id))
  return shifts.filter((s) => {
    const settling = now < Date.parse(s.start_at) + STARTUP_GRACE_MS
    return now < Date.parse(s.expires_at) && (settling || s.collar_ids.some((id) => moving.has(id)))
  })
}
