import { useEffect, useMemo, useState } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { Feature, FeatureCollection } from 'geojson'
import type { Paddock } from '../usePaddocks'
import type { Shift } from '../useShifts'
import { shiftGeometry } from './shiftGeometry'

const BELOW_COWS = 'cow-rings'

type Props = {
  shifts: Shift[]
  paddocks: Paddock[]
}

export function ShiftLayer({ shifts, paddocks }: Props) {
  const geometries = useMemo(
    () =>
      shifts.flatMap((s) => {
        const from = paddocks.find((p) => p.id === s.from_paddock_id)
        const to = paddocks.find((p) => p.id === s.to_paddock_id)
        if (!from || !to) return []
        return [shiftGeometry(from.polygon.coordinates[0], to.polygon.coordinates[0], Date.parse(s.start_at), s.speed_ms)]
      }),
    [shifts, paddocks],
  )

  const now = useNow(Math.max(0, ...geometries.map((g) => g.endsAt)))
  const live = geometries.filter((g) => now < g.endsAt)
  if (live.length === 0) return null

  const features: Feature[] = live.flatMap((g) => {
    const area: Feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...g.hull, g.hull[0]]] } }
    const wall = g.wallAt(now)
    return wall ? [area, { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: wall } }] : [area]
  })
  const data: FeatureCollection = { type: 'FeatureCollection', features }

  return (
    <Source id="shifts" type="geojson" data={data}>
      <Layer
        id="shift-area"
        type="fill"
        beforeId={BELOW_COWS}
        filter={['==', ['geometry-type'], 'Polygon']}
        paint={{ 'fill-color': '#60a5fa', 'fill-opacity': 0.12 }}
      />
      <Layer
        id="shift-outline"
        type="line"
        beforeId={BELOW_COWS}
        filter={['==', ['geometry-type'], 'Polygon']}
        paint={{ 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2] }}
      />
      <Layer
        id="shift-wall"
        type="line"
        beforeId={BELOW_COWS}
        filter={['==', ['geometry-type'], 'LineString']}
        layout={{ 'line-cap': 'round' }}
        paint={{ 'line-color': '#3b82f6', 'line-width': 5 }}
      />
    </Source>
  )
}

function useNow(until: number) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t < until) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [until])

  return now
}
