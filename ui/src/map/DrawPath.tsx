import { useEffect, useRef } from 'react'
import { useMap } from '@vis.gl/react-maplibre'
import { TerraDraw, TerraDrawLineStringMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { LngLat } from './geo'

type Props = {
  active: boolean
  onFinish: (path: LngLat[]) => void
}

export function DrawPath({ active, onFinish }: Props) {
  const { current: mapRef } = useMap()
  const finish = useRef(onFinish)

  useEffect(() => {
    finish.current = onFinish
  }, [onFinish])

  useEffect(() => {
    if (!active || !mapRef) return

    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map: mapRef.getMap() }),
      modes: [
        new TerraDrawLineStringMode({
          styles: {
            lineStringColor: '#60a5fa',
            lineStringWidth: 4,
            closingPointColor: '#ffffff',
            closingPointOutlineColor: '#3b82f6',
            coordinatePointColor: '#ffffff',
            coordinatePointOutlineColor: '#3b82f6',
          },
        }),
      ],
    })

    draw.on('finish', (id) => {
      const feature = draw.getSnapshotFeature(id)
      if (feature?.geometry.type === 'LineString') {
        finish.current(feature.geometry.coordinates as LngLat[])
      }
    })

    draw.start()
    draw.setMode('linestring')
    return () => draw.stop()
  }, [active, mapRef])

  return null
}
