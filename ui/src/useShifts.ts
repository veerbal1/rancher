import { useEffect, useState } from 'react'

export type Shift = {
  id: string
  farmer_id: string
  from_paddock_id: string
  to_paddock_id: string
  collar_ids: string[]
  start_at: string
  speed_ms: number
  expires_at: string
}

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL

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

  const startShift = async (fromPaddockId: string, toPaddockId: string): Promise<Shift> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/shifts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from_paddock_id: fromPaddockId, to_paddock_id: toPaddockId }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setShifts((prev) => [...prev, body])
    return body
  }

  return { shifts, error, startShift }
}
