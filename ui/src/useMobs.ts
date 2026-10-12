import { useEffect, useState } from 'react'

export type Mob = {
  id: string
  farmer_id: string
  name: string
  color: string
  created_at: string
}

export const MOB_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899']

export const mobInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL

export function useMobs(farmerId: string | null) {
  const [mobs, setMobs] = useState<Mob[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setMobs([])
    if (!farmerId) return

    let cancelled = false
    fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/mobs`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setMobs(data)
      })
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [farmerId])

  const createMob = async (name: string, color: string): Promise<Mob> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/mobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, color }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setMobs((prev) => [...prev, body])
    return body
  }

  const updateMob = async (id: string, patch: { name?: string; color?: string }): Promise<Mob> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/mobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setMobs((prev) => prev.map((m) => (m.id === id ? body : m)))
    return body
  }

  return { mobs, error, createMob, updateMob }
}
