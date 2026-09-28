import { useEffect, useState } from 'react'

export type Cow = {
  sim_id: string
  seq: number
  time: string
  cow_id: string
  x: number
  y: number
  state: string
  level: string
}

const API_URL = import.meta.env.VITE_API_URL

export function useCows(farm: string) {
  const [cows, setCows] = useState<Cow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}?farm=${encodeURIComponent(farm)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setCows(await res.json())
        setError('')
      } catch (e) {
        setError(String(e))
      }
    }

    load()
    const id = setInterval(load, 1000)
    return () => clearInterval(id)
  }, [farm])

  return { cows, error }
}
