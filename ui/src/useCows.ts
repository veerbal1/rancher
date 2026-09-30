import { useEffect, useState } from 'react'

export type Cow = {
  farmer_id: string
  seq: number
  time: string
  collar_id: string
  paddock_id: string
  lat: number
  lng: number
  heading: number
  state: string
  level: string
  side?: 'none' | 'left' | 'right' | 'both'
}

const API_URL = import.meta.env.VITE_API_URL

export function useCows(farmerId: string | null) {
  const [cows, setCows] = useState<Cow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setCows([])
    setError('')
    if (!farmerId) return

    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}?farmer=${encodeURIComponent(farmerId)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setCows(data)
          setError('')
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }

    load()
    const id = setInterval(load, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [farmerId])

  return { cows, error }
}
