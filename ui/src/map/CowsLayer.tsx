import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { FeatureCollection, Point } from 'geojson'
import type { Cow } from '../useCows'
import { toLngLat } from './geo'

const COLORS: Record<string, string> = {
  inside: '#2e9e5b',
  warning: '#e0a100',
  breached: '#d64545',
}

export function CowsLayer({ cows }: { cows: Cow[] }) {
  const points = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: cows.map((c) => ({
        type: 'Feature',
        properties: { cow_id: c.cow_id, state: c.state },
        geometry: { type: 'Point', coordinates: toLngLat(c.x, c.y) },
      })),
    }),
    [cows],
  )

  return (
    <Source id="cows" type="geojson" data={points}>
      <Layer
        id="cow-dots"
        type="circle"
        paint={{
          'circle-radius': 6,
          'circle-color': [
            'match',
            ['get', 'state'],
            'inside', COLORS.inside,
            'warning', COLORS.warning,
            'breached', COLORS.breached,
            '#888',
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
    </Source>
  )
}
