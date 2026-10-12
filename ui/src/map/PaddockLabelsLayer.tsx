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
        'text-field': ['get', 'label'],
        'text-font': ['Amazon Ember Regular,Noto Sans Regular'],
        'text-size': 12,
        'text-max-width': 12,
      }}
      paint={{
        'text-color': ['case', isSelected, '#ffffff', 'rgba(255, 255, 255, 0.8)'],
        'text-halo-color': 'rgba(0, 0, 0, 0.2)',
        'text-halo-width': 1,
      }}
    />
  )
}
