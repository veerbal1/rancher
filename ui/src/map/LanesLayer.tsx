import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { FeatureCollection, LineString } from 'geojson'
import type { Lane } from '../useLanes'

export function LanesLayer({ lanes }: { lanes: Lane[] }) {
  const data = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: lanes.map((l) => ({ type: 'Feature', properties: {}, geometry: l.path })),
    }),
    [lanes],
  )

  return (
    <Source id="lanes" type="geojson" data={data}>
      <Layer
        id="lanes-line"
        type="line"
        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
        paint={{ 'line-color': '#fde68a', 'line-width': 2, 'line-opacity': 0.85, 'line-dasharray': [2, 1.5] }}
      />
    </Source>
  )
}
