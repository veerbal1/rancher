import { useEffect } from 'react'
import { useMap } from '@vis.gl/react-maplibre'
import { TerraDraw, TerraDrawPolygonMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { LngLat } from './geo'

type Props = {
  active: boolean
  onFinish: (ring: LngLat[]) => void
}

export function DrawPaddock({ active, onFinish }: Props) {
  const { current: mapRef } = useMap()

  useEffect(() => {
    if (!active || !mapRef) return

    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: mapRef.getMap() }),
      modes: [
        new TerraDrawPolygonMode({
          styles: {
            fillColor: '#2e9e5b',
            fillOpacity: 0.25,
            outlineColor: '#ffffff',
            outlineWidth: 2,
            closingPointColor: '#ffffff',
            closingPointOutlineColor: '#2e9e5b',
          },
        }),
      ],
    })

    draw.on('finish', (id) => {
      const feature = draw.getSnapshotFeature(id)
      if (feature?.geometry.type === 'Polygon') {
        onFinish(feature.geometry.coordinates[0] as LngLat[])
      }
    })

    draw.start()
    draw.setMode('polygon')
    return () => draw.stop()
  }, [active, mapRef, onFinish])

  return null
}
