import { useEffect, useState } from 'react'

export type Collar = {
  id: string
  farmer_id: string
  number: number
  name: string
  paddock_id: string | null
  created_at: string
}

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL

export function useCollars(farmerId: string | null) {
  const [collars, setCollars] = useState<Collar[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setCollars([])
    if (!farmerId) return

    let cancelled = false
    fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/collars`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setCollars(data)
      })
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [farmerId])

  const buyCollars = async (count: number): Promise<Collar[]> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/collars`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setCollars((prev) => [...prev, ...body])
    return body
  }

  return { collars, error, buyCollars }
}
