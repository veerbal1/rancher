import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { Feature, Polygon } from 'geojson'
import type { LngLat } from './geo'

export function FarmBoundaryLayer({ ring }: { ring: LngLat[] }) {
  const shape = useMemo<Feature<Polygon>>(
    () => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }),
    [ring],
  )

  return (
    <Source id="farm-boundary" type="geojson" data={shape}>
      <Layer id="farm-boundary-line" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2] }} />
    </Source>
  )
}
