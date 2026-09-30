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
  fence_version?: number
}

const API_URL = import.meta.env.VITE_API_URL
const WS_URL = import.meta.env.VITE_WS_URL
const STALE_MS = 10_000
const RECONNECT_MS = 2000
const QUIET_MS = 3000

export function useCows(farmerId: string | null) {
  const [cows, setCows] = useState<Cow[]>([])
  const [error, setError] = useState('')
  const [live, setLive] = useState(false)

  useEffect(() => {
    setCows([])
    setError('')
    setLive(false)
    if (!farmerId) return

    let cancelled = false
    let socket: WebSocket | null = null
    let retry = 0
    let lastPush = 0
    const known = new Map<string, { cow: Cow; seenAt: number }>()

    const publish = () => setCows([...known.values()].map((k) => k.cow))

    const merge = (list: Cow[]) => {
      const now = Date.now()
      for (const c of list) {
        const prev = known.get(c.collar_id)
        if (prev && Date.parse(prev.cow.time) > Date.parse(c.time)) continue
        known.set(c.collar_id, { cow: c, seenAt: now })
      }
      publish()
    }

    const load = async () => {
      try {
        const res = await fetch(`${API_URL}?farmer=${encodeURIComponent(farmerId)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          merge(data)
          setError('')
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }

    const connect = () => {
      const ws = new WebSocket(`${WS_URL}?farmer=${encodeURIComponent(farmerId)}`)
      socket = ws
      ws.onmessage = (e) => {
        if (cancelled) return
        lastPush = Date.now()
        setLive(true)
        merge(JSON.parse(e.data))
      }
      ws.onclose = () => {
        if (cancelled) return
        setLive(false)
        retry = window.setTimeout(connect, RECONNECT_MS)
      }
    }

    const tick = () => {
      const now = Date.now()
      let dropped = false
      for (const [id, k] of known) {
        if (now - k.seenAt > STALE_MS) {
          known.delete(id)
          dropped = true
        }
      }
      if (dropped) publish()
      if (now - lastPush > QUIET_MS) {
        setLive(false)
        load()
      }
    }

    load()
    if (WS_URL) connect()
    const id = setInterval(tick, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
      clearTimeout(retry)
      socket?.close()
    }
  }, [farmerId])

  return { cows, error, live }
}
