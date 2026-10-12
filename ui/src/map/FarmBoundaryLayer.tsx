import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { Feature, Polygon } from 'geojson'
import type { LngLat } from './geo'

const WORLD: LngLat[] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
]

function insideSign(ring: LngLat[]) {
  let area = 0
  for (let i = 0; i < ring.length - 1; i++) area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return area < 0 ? -1 : 1
}

export function FarmBoundaryLayer({ ring }: { ring: LngLat[] }) {
  const shape = useMemo<Feature<Polygon>>(
    () => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }),
    [ring],
  )
  const mask = useMemo<Feature<Polygon>>(
    () => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [WORLD, ring] } }),
    [ring],
  )
  const inside = insideSign(ring)

  return (
    <>
      <Source id="farm-mask" type="geojson" data={mask}>
        <Layer id="farm-mask-fill" type="fill" paint={{ 'fill-color': '#000000', 'fill-opacity': 0.45 }} />
      </Source>
      <Source id="farm-boundary" type="geojson" data={shape}>
        <Layer id="farm-boundary-band" type="line" paint={{ 'line-color': '#294e3b', 'line-width': 5, 'line-opacity': 0.85 }} />
        <Layer id="farm-boundary-inner" type="line" paint={{ 'line-color': '#e3fdcb', 'line-width': 2, 'line-offset': 3 * inside }} />
        <Layer
          id="farm-boundary-outer"
          type="line"
          paint={{ 'line-color': '#ffffff', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-offset': -4 * inside }}
        />
      </Source>
    </>
  )
}
