import { useEffect, useState } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { FeatureCollection, LineString } from 'geojson'
import type { Cow } from '../useCows'
import type { Shift } from '../useShifts'

const BELOW_COWS = 'cow-rings'
const STARTUP_GRACE_MS = 30_000
const EARTH_CIRCUMFERENCE_M = 40_075_016.686

type Props = {
  shifts: Shift[]
  cows: Cow[]
}

export function ShiftLayer({ shifts, cows }: Props) {
  const now = useNow(1000)
  const moving = new Set(cows.filter((c) => c.state === 'moving').map((c) => c.collar_id))

  const visible = shifts.filter((s) => {
    const start = Date.parse(s.start_at)
    const settling = now < start + STARTUP_GRACE_MS
    return now < Date.parse(s.expires_at) && (settling || s.collar_ids.some((id) => moving.has(id)))
  })
  if (visible.length === 0) return null

  const data: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: visible.map((s) => {
      const lat = s.path.coordinates[0][1]
      const pixelsAt = (zoom: number) => (s.width_m * 512 * 2 ** zoom) / (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180))
      return {
        type: 'Feature',
        properties: { w10: pixelsAt(10), w22: pixelsAt(22) },
        geometry: { type: 'LineString', coordinates: s.path.coordinates },
      }
    }),
  }

  return (
    <Source id="shifts" type="geojson" data={data}>
      <Layer
        id="shift-lane"
        type="line"
        beforeId={BELOW_COWS}
        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
        paint={{
          'line-color': '#60a5fa',
          'line-opacity': 0.4,
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, ['get', 'w10'], 22, ['get', 'w22']],
        }}
      />
      <Layer
        id="shift-centre"
        type="line"
        beforeId={BELOW_COWS}
        paint={{ 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2] }}
      />
    </Source>
  )
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])

  return now
}
