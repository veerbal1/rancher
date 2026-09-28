import { useEffect, useState } from 'react'

export type Farmer = { id: string; name: string; created_at: string }

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL

export function useFarmers() {
  const [farmers, setFarmers] = useState<Farmer[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${FARM_API_URL}/farmers`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setFarmers(await res.json())
      })
      .catch((e) => setError(String(e)))
  }, [])

  const createFarmer = async (name: string): Promise<Farmer> => {
    const res = await fetch(`${FARM_API_URL}/farmers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setFarmers((prev) => [...prev, body])
    return body
  }

  return { farmers, error, createFarmer }
}
