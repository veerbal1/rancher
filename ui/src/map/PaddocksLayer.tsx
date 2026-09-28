import { useMemo } from 'react'
import { Source, Layer } from '@vis.gl/react-maplibre'
import type { FeatureCollection, Polygon } from 'geojson'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { Paddock } from '../usePaddocks'

type Props = {
  paddocks: Paddock[]
  selectedId: string | null
}

export function PaddocksLayer({ paddocks, selectedId }: Props) {
  const shapes = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: 'FeatureCollection',
      features: paddocks.map((p) => ({
        type: 'Feature',
        properties: { id: p.id, name: p.name, area_ha: p.area_ha },
        geometry: p.polygon,
      })),
    }),
    [paddocks],
  )

  const isSelected: ExpressionSpecification = ['==', ['get', 'id'], selectedId ?? '']

  return (
    <Source id="paddocks" type="geojson" data={shapes}>
      <Layer
        id="paddocks-fill"
        type="fill"
        paint={{ 'fill-color': '#2e9e5b', 'fill-opacity': ['case', isSelected, 0.4, 0.15] }}
      />
      <Layer
        id="paddocks-outline"
        type="line"
        paint={{
          'line-color': ['case', isSelected, '#ffd166', '#ffffff'],
          'line-width': ['case', isSelected, 3, 1.5],
        }}
      />
    </Source>
  )
}
