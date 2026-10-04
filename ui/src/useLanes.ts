import { useEffect, useState } from 'react'
import type { LngLat } from './map/geo'

export type Lane = {
  from_paddock_id: string
  to_paddock_id: string
  path: { type: 'LineString'; coordinates: LngLat[] }
  width_m: number
  updated_at: string
}

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL

export const laneBetween = (lanes: Lane[], a: string, b: string) =>
  lanes.find((l) => (l.from_paddock_id === a && l.to_paddock_id === b) || (l.from_paddock_id === b && l.to_paddock_id === a))

export function useLanes(farmerId: string | null) {
  const [lanes, setLanes] = useState<Lane[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setLanes([])
    if (!farmerId) return

    let cancelled = false
    fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/lanes`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setLanes(data)
      })
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [farmerId])

  const saveLane = async (fromPaddockId: string, toPaddockId: string, path: LngLat[]): Promise<Lane> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/lanes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from_paddock_id: fromPaddockId,
        to_paddock_id: toPaddockId,
        path: { type: 'LineString', coordinates: path },
      }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setLanes((prev) => [...prev.filter((l) => l !== laneBetween(prev, fromPaddockId, toPaddockId)), body])
    return body
  }

  return { lanes, error, saveLane }
}
