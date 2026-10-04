import { useEffect, useMemo } from 'react'
import { Source, Layer, useMap } from '@vis.gl/react-maplibre'
import type { FeatureCollection, Polygon } from 'geojson'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { Paddock } from '../usePaddocks'

type Props = {
  paddocks: Paddock[]
  selectedId: string | null
}

const ROOFS = {
  'roof-white': { base: '#f4f4f1', ridge: '#d2d2cb', shine: '#ffffff' },
  'roof-brown': { base: '#8b5a2b', ridge: '#6b4321', shine: '#a87140' },
}

function roofImage({ base, ridge, shine }: (typeof ROOFS)[keyof typeof ROOFS]) {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  for (const x of [0, size / 2]) {
    ctx.fillStyle = ridge
    ctx.fillRect(x, 0, 2, size)
    ctx.fillStyle = shine
    ctx.fillRect(x + 2, 0, 1, size)
  }
  return ctx.getImageData(0, 0, size, size)
}

export function PaddocksLayer({ paddocks, selectedId }: Props) {
  const { current: mapRef } = useMap()

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return
    const addRoof = (id: string) => {
      if (id in ROOFS && !map.hasImage(id)) map.addImage(id, roofImage(ROOFS[id as keyof typeof ROOFS]), { pixelRatio: 2 })
    }
    Object.keys(ROOFS).forEach(addRoof)
    const onMissing = (e: { id: string }) => addRoof(e.id)
    map.on('styleimagemissing', onMissing)
    return () => {
      map.off('styleimagemissing', onMissing)
    }
  }, [mapRef])

  const shapes = useMemo<FeatureCollection<Polygon>>(
    () => ({
      type: 'FeatureCollection',
      features: paddocks.map((p) => ({
        type: 'Feature',
        properties: { id: p.id, name: p.name, area_ha: p.area_ha, kind: p.kind ?? 'paddock', capacity: p.capacity ?? 0 },
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
        filter={['==', ['get', 'kind'], 'paddock']}
        paint={{ 'fill-color': '#2e9e5b', 'fill-opacity': ['case', isSelected, 0.4, 0.15] }}
      />
      <Layer
        id="sheds-fill"
        type="fill"
        filter={['!=', ['get', 'kind'], 'paddock']}
        paint={{
          'fill-pattern': ['match', ['get', 'kind'], 'milking_shed', 'roof-white', 'roof-brown'],
          'fill-opacity': ['case', isSelected, 1, 0.92],
        }}
      />
      <Layer
        id="paddocks-outline"
        type="line"
        paint={{
          'line-color': ['case', isSelected, '#ffd166', ['==', ['get', 'kind'], 'milking_shed'], '#8a8a84', '#ffffff'],
          'line-width': ['case', isSelected, 3, 1.5],
        }}
      />
    </Source>
  )
}
