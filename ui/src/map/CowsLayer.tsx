import { useEffect, useMemo, useState } from 'react'
import type { ExpressionSpecification } from 'maplibre-gl'
import { Source, Layer, useMap } from '@vis.gl/react-maplibre'
import type { FeatureCollection, Point } from 'geojson'
import type { Cow } from '../useCows'
import { useSmoothCows } from './useSmoothCows'

const COW_IMAGE = 'cow'

const COLORS: Record<string, string> = {
  inside: '#2e9e5b',
  warning: '#e0a100',
  breached: '#d64545',
}

const stateColor: ExpressionSpecification = [
  'match',
  ['get', 'state'],
  'inside', COLORS.inside,
  'warning', COLORS.warning,
  'breached', COLORS.breached,
  '#888',
]

export function CowsLayer({ cows }: { cows: Cow[] }) {
  const { current: mapRef } = useMap()
  const [imageReady, setImageReady] = useState(false)
  const shown = useSmoothCows(cows)

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return
    if (map.hasImage(COW_IMAGE)) {
      setImageReady(true)
      return
    }

    let cancelled = false
    map.loadImage('/cow.png').then(({ data }) => {
      if (cancelled) return
      if (!map.hasImage(COW_IMAGE)) map.addImage(COW_IMAGE, data, { pixelRatio: 2 })
      setImageReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [mapRef])

  const points = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: shown.map((c) => ({
        type: 'Feature',
        properties: { collar_id: c.collar_id, state: c.state, heading: c.heading },
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      })),
    }),
    [shown],
  )

  return (
    <Source id="cows" type="geojson" data={points}>
      <Layer
        id="cow-rings"
        type="circle"
        paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 7, 17, 14, 20, 28],
          'circle-color': stateColor,
          'circle-opacity': 0.35,
          'circle-stroke-width': 2,
          'circle-stroke-color': stateColor,
        }}
      />
      {imageReady && (
        <Layer
          id="cow-icons"
          type="symbol"
          layout={{
            'icon-image': COW_IMAGE,
            'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.25, 17, 0.5, 20, 1],
            'icon-rotate': ['get', 'heading'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />
      )}
    </Source>
  )
}
