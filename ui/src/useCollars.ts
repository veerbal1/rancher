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
const MAX_PER_ASSIGN = 100

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

  const assignCollars = async (collarIds: string[], paddockId: string | null) => {
    if (!farmerId) throw new Error('no farmer selected')
    for (let i = 0; i < collarIds.length; i += MAX_PER_ASSIGN) {
      const chunk = collarIds.slice(i, i + MAX_PER_ASSIGN)
      const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/collars`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ collar_ids: chunk, paddock_id: paddockId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const ids = new Set(chunk)
      setCollars((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, paddock_id: paddockId } : c)))
    }
  }

  const deleteCollar = async (id: string) => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(
      `${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/collars/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    setCollars((prev) => prev.filter((c) => c.id !== id))
  }

  const moveLocally = (collarIds: string[], paddockId: string) => {
    const ids = new Set(collarIds)
    setCollars((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, paddock_id: paddockId } : c)))
  }

  const forgetPaddock = (paddockId: string) => {
    setCollars((prev) => prev.map((c) => (c.paddock_id === paddockId ? { ...c, paddock_id: null } : c)))
  }

  return { collars, error, buyCollars, assignCollars, deleteCollar, moveLocally, forgetPaddock }
}
