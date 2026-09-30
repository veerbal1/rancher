import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-maplibre'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { LngLat } from './geo'

type Props = {
  initialRing: LngLat[]
  onChange: (ring: LngLat[]) => void
}

const round = (v: number) => Math.round(v * 1e9) / 1e9

export function EditPaddock({ initialRing, onChange }: Props) {
  const { current: mapRef } = useMap()
  const change = useRef(onChange)
  const start = useRef(initialRing)

  useEffect(() => {
    change.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!mapRef) return

    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: mapRef.getMap() }),
      modes: [
        new TerraDrawPolygonMode(),
        new TerraDrawSelectMode({
          keyEvents: { deselect: null, delete: null, rotate: null, scale: null },
          flags: {
            polygon: {
              feature: {
                draggable: false,
                selfIntersectable: false,
                coordinates: { draggable: true, midpoints: true, deletable: true },
              },
            },
          },
          styles: {
            selectedPolygonColor: '#2e9e5b',
            selectedPolygonFillOpacity: 0.25,
            selectedPolygonOutlineColor: '#ffd166',
            selectedPolygonOutlineWidth: 3,
            selectionPointColor: '#ffffff',
            selectionPointOutlineColor: '#2e9e5b',
            selectionPointWidth: 6,
            midPointColor: '#ffd166',
            midPointOutlineColor: '#ffffff',
          },
        }),
      ],
    })

    const id = crypto.randomUUID()
    const feature = {
      id,
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [start.current.map(([lng, lat]) => [round(lng), round(lat)])] },
      properties: { mode: 'polygon' },
    } as GeoJSONStoreFeatures

    draw.on('ready', () => {
      draw.addFeatures([feature])
      draw.setMode('select')
      draw.selectFeature(id)
    })
    draw.on('deselect', () => draw.selectFeature(id))
    draw.on('change', (ids) => {
      if (!ids.includes(id)) return
      const f = draw.getSnapshotFeature(id)
      if (f?.geometry.type === 'Polygon') change.current(f.geometry.coordinates[0] as LngLat[])
    })

    draw.start()
    return () => draw.stop()
  }, [mapRef])

  return null
}
