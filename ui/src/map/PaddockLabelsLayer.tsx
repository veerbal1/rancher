import { useEffect } from 'react'
import type { ExpressionSpecification } from 'maplibre-gl'
import { Layer, useMap } from '@vis.gl/react-maplibre'

const LABEL_LAYER = 'paddocks-label'

export function PaddockLabelsLayer({ selectedId }: { selectedId: string | null }) {
  const { current: mapRef } = useMap()
  const isSelected: ExpressionSpecification = ['==', ['get', 'id'], selectedId ?? '']

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return

    // react-maplibre adds layers in whatever order their sources become ready, so keep labels above the cows.
    const keepOnTop = () => {
      const order = map.getLayersOrder()
      if (map.getLayer(LABEL_LAYER) && order[order.length - 1] !== LABEL_LAYER) map.moveLayer(LABEL_LAYER)
    }

    keepOnTop()
    map.on('styledata', keepOnTop)
    return () => {
      map.off('styledata', keepOnTop)
    }
  }, [mapRef])

  return (
    <Layer
      id={LABEL_LAYER}
      source="paddocks"
      type="symbol"
      layout={{
        'text-field': [
          'case',
          ['==', ['get', 'kind'], 'milking_shed'],
          ['concat', ['get', 'name'], ' · ', ['to-string', ['get', 'capacity']], ' cows'],
          ['concat', ['get', 'name'], ' · ', ['to-string', ['get', 'area_ha']], ' ha'],
        ],
        'text-font': ['Amazon Ember Bold,Noto Sans Bold'],
        'text-size': 13,
        'text-max-width': 12,
      }}
      paint={{
        'text-color': ['case', isSelected, '#ffd166', '#ffffff'],
        'text-halo-color': 'rgba(0, 0, 0, 0.6)',
        'text-halo-width': 1.5,
      }}
    />
  )
}
