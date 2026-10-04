import { useCallback, useEffect, useState } from 'react'

export type SessionCowStatus = 'waiting' | 'called' | 'milking' | 'done' | 'missed'

export type SessionCow = {
  collar_id: string
  number: number
  status: SessionCowStatus
  called_at?: string
  milking_from?: string
  milking_to?: string
}

export type MilkingSession = {
  id: string
  from_paddock_id: string
  shed_id: string
  to_paddock_id: string
  capacity: number
  milking_secs: number
  status: 'running' | 'stopped' | 'done'
  slot?: 'morning' | 'evening'
  in_shed: number
  started_at: string
  ended_at?: string
  cows: SessionCow[]
}

export type MilkingSchedule = {
  enabled: boolean
  timezone: string
  morning_at: string
  evening_at: string
  rest_shed_id: string
  shed_id: string
  paddock_id: string
  updated_at?: string
}

const FARM_API_URL = import.meta.env.VITE_FARM_API_URL
const REFRESH_MS = 5000

export function useMilking(farmerId: string | null) {
  const [sessions, setSessions] = useState<MilkingSession[]>([])
  const [schedule, setSchedule] = useState<MilkingSchedule | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!farmerId) return
    try {
      const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/milking-sessions`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSessions(await res.json())
      setError('')
    } catch (e) {
      setError(String(e))
    }
  }, [farmerId])

  useEffect(() => {
    setSchedule(null)
    if (!farmerId) return
    let cancelled = false
    fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/milking-schedule`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setSchedule(data)
      })
      .catch((e) => !cancelled && setError(String(e)))
    return () => {
      cancelled = true
    }
  }, [farmerId])

  useEffect(() => {
    setSessions([])
    if (!farmerId) return
    load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [farmerId, load])

  const startMilking = async (fromPaddockId: string, shedId: string, toPaddockId: string): Promise<MilkingSession> => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/milking-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from_paddock_id: fromPaddockId, shed_id: shedId, to_paddock_id: toPaddockId }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setSessions((prev) => [body, ...prev])
    return body
  }

  const stopMilking = async (sessionId: string) => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(
      `${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/milking-sessions/${encodeURIComponent(sessionId)}/stop`,
      { method: 'POST' },
    )
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: body.status, ended_at: body.ended_at } : s)))
  }

  const saveSchedule = async (next: MilkingSchedule) => {
    if (!farmerId) throw new Error('no farmer selected')
    const res = await fetch(`${FARM_API_URL}/farmers/${encodeURIComponent(farmerId)}/milking-schedule`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    setSchedule(body)
  }

  return { sessions, schedule, error, startMilking, stopMilking, saveSchedule }
}
