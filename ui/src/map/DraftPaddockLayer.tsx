import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { Feature, Polygon } from 'geojson'
import type { LngLat } from './geo'

export function DraftPaddockLayer({ ring }: { ring: LngLat[] }) {
  const shape = useMemo<Feature<Polygon>>(
    () => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }),
    [ring],
  )

  return (
    <Source id="draft-paddock" type="geojson" data={shape}>
      <Layer id="draft-paddock-fill" type="fill" paint={{ 'fill-color': '#2e9e5b', 'fill-opacity': 0.25 }} />
      <Layer id="draft-paddock-outline" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 2 }} />
    </Source>
  )
}
