import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { FeatureCollection, Point } from 'geojson'
import type { Paddock } from '../usePaddocks'

export function GatesLayer({ paddocks }: { paddocks: Paddock[] }) {
  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: paddocks.flatMap((p) =>
        (p.gates ?? []).map((g) => ({
          type: 'Feature' as const,
          properties: { id: g.id, name: g.name },
          geometry: { type: 'Point' as const, coordinates: [g.lng, g.lat] },
        })),
      ),
    }),
    [paddocks],
  )

  return (
    <Source id="gates" type="geojson" data={data}>
      <Layer
        id="gates-point"
        type="circle"
        paint={{ 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': '#294e3b', 'circle-stroke-width': 2 }}
      />
      <Layer
        id="gates-label"
        type="symbol"
        layout={{
          'text-field': ['get', 'name'],
          'text-font': ['Amazon Ember Regular,Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        }}
        paint={{ 'text-color': '#ffffff', 'text-halo-color': 'rgba(0, 0, 0, 0.45)', 'text-halo-width': 1 }}
      />
    </Source>
  )
}
