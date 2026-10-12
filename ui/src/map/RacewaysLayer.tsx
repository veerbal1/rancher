import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import type { LngLat } from './geo'

type Road = { id: string; path: LngLat[]; widthM: number }

const EARTH_M = 40075016.686
const EDGE_PX = 3

function widthPx(lat: number, extraPx: number): ExpressionSpecification {
  const perMetre = (z: number) => (512 * 2 ** z) / (EARTH_M * Math.cos((lat * Math.PI) / 180))
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    10,
    ['+', ['*', ['get', 'width_m'], perMetre(10)], extraPx],
    22,
    ['+', ['*', ['get', 'width_m'], perMetre(22)], extraPx],
  ]
}

export function RacewaysLayer({ roads }: { roads: Road[] }) {
  const data = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: roads.map((r) => ({
        type: 'Feature',
        properties: { id: r.id, width_m: r.widthM },
        geometry: { type: 'LineString', coordinates: r.path },
      })),
    }),
    [roads],
  )
  const lat = roads[0]?.path[0]?.[1] ?? 0

  return (
    <Source id="raceways" type="geojson" data={data}>
      <Layer
        id="raceways-edge"
        type="line"
        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
        paint={{ 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': widthPx(lat, EDGE_PX) }}
      />
      <Layer
        id="raceways-track"
        type="line"
        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
        paint={{ 'line-color': '#3d433f', 'line-width': widthPx(lat, 0) }}
      />
    </Source>
  )
}
