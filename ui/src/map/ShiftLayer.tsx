import { Source, Layer } from '@vis.gl/react-maplibre'
import type { FeatureCollection, LineString } from 'geojson'
import type { Shift } from '../useShifts'

const BELOW_COWS = 'cow-rings'
const EARTH_CIRCUMFERENCE_M = 40_075_016.686

export function ShiftLayer({ shifts }: { shifts: Shift[] }) {
  if (shifts.length === 0) return null

  const data: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: shifts.map((s) => {
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
