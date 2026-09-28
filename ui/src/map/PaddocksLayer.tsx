import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { FeatureCollection, Polygon } from 'geojson'
import type { Paddock } from '../usePaddocks'

export function PaddocksLayer({ paddocks }: { paddocks: Paddock[] }) {
  const shapes = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: 'FeatureCollection',
      features: paddocks.map((p) => ({
        type: 'Feature',
        properties: { id: p.id, name: p.name },
        geometry: p.polygon,
      })),
    }),
    [paddocks],
  )

  return (
    <Source id="paddocks" type="geojson" data={shapes}>
      <Layer id="paddocks-fill" type="fill" paint={{ 'fill-color': '#2e9e5b', 'fill-opacity': 0.2 }} />
      <Layer id="paddocks-outline" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 2 }} />
    </Source>
  )
}
