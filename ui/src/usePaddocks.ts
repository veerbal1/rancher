import { useEffect, useState } from 'react'
import type { LngLat } from './map/geo'

export type PaddockKind = 'paddock' | 'milking_shed' | 'rest_shed'

export const KINDS: { value: PaddockKind; label: string }[] = [
  { value: 'paddock', label: 'Paddock' },
  { value: 'milking_shed', label: 'Milking shed' },
  { value: 'rest_shed', label: 'Rest shed' },
]

export type Paddock = {
  id: string
  farmer_id: string
  name: string
  polygon: { type: 'Polygon'; coordinates: LngLat[][] }
  area_ha: number
  fence_version?: number
  kind?: PaddockKind
  capacity?: number
  running_session?: string
  created_at: string
}

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL

export function usePaddocks(farmerId: string | null) {
  const [paddocks, setPaddocks] = useState<Paddock[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setPaddocks([])
    if (!farmerId) return

    let cancelled = false
    fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/paddocks`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setPaddocks(data)
      })
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [farmerId])

  const createPaddock = async (ring: LngLat[]): Promise<Paddock> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/paddocks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ polygon: { type: 'Polygon', coordinates: [ring] } }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setPaddocks((prev) => [...prev, body])
    return body
  }

  const deletePaddock = async (id: string) => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(
      `${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/paddocks/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    setPaddocks((prev) => prev.filter((p) => p.id !== id))
  }

  const updatePaddock = async (
    id: string,
    patch: { name?: string; ring?: LngLat[]; kind?: PaddockKind; capacity?: number },
  ): Promise<Paddock> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(
      `${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/paddocks/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: patch.name,
          polygon: patch.ring ? { type: 'Polygon', coordinates: [patch.ring] } : undefined,
          kind: patch.kind,
          capacity: patch.capacity,
        }),
      },
    )
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setPaddocks((prev) => prev.map((p) => (p.id === id ? body : p)))
    return body
  }

  return { paddocks, error, createPaddock, updatePaddock, deletePaddock }
}
