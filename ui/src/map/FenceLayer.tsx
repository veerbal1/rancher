import { Source, Layer } from '@vis.gl/react-maplibre'
import type { FeatureCollection, LineString } from 'geojson'
import { square } from './geo'

// The sim's fixed fence: 0..100 m, with the warning zone starting 10 m inside.
const FENCE: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { kind: 'fence' }, geometry: { type: 'LineString', coordinates: square(0, 100) } },
    { type: 'Feature', properties: { kind: 'warning' }, geometry: { type: 'LineString', coordinates: square(10, 90) } },
  ],
}

export function FenceLayer() {
  return (
    <Source id="fence" type="geojson" data={FENCE}>
      <Layer
        id="fence-line"
        type="line"
        filter={['==', ['get', 'kind'], 'fence']}
        paint={{ 'line-color': '#ffffff', 'line-width': 3 }}
      />
      <Layer
        id="warning-line"
        type="line"
        filter={['==', ['get', 'kind'], 'warning']}
        paint={{ 'line-color': '#ffd166', 'line-width': 1.5, 'line-dasharray': [2, 2] }}
      />
    </Source>
  )
}
