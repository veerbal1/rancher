import { useEffect, useState } from 'react'
import type { LngLat } from './map/geo'

export type Raceway = {
  id: string
  farmer_id: string
  path: { type: 'LineString'; coordinates: LngLat[] }
  width_m: number
  created_at: string
}

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL

export function useRaceways(farmerId: string | null) {
  const [raceways, setRaceways] = useState<Raceway[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setRaceways([])
    if (!farmerId) return

    let cancelled = false
    fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/raceways`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setRaceways(data)
      })
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [farmerId])

  const createRaceway = async (path: LngLat[], widthM: number): Promise<Raceway> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/raceways`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: { type: 'LineString', coordinates: path }, width_m: widthM }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setRaceways((prev) => [...prev, body])
    return body
  }

  const deleteRaceway = async (id: string) => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/raceways/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    setRaceways((prev) => prev.filter((r) => r.id !== id))
  }

  return { raceways, error, createRaceway, deleteRaceway }
}
