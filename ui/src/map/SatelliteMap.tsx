import type { ReactNode } from 'react'
import { AttributionControl, Map } from '@vis.gl/react-maplibre'
import * as maplibregl from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

// Vite moves MapLibre's worker when bundling, so tell MapLibre where Vite put it.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

const STYLE_URL = `https://maps.geo.ap-south-1.amazonaws.com/v2/styles/Hybrid/descriptor?key=${import.meta.env.VITE_LOCATION_KEY}`

type Props = {
  initialBounds: LngLatBoundsLike
  children?: ReactNode
}

export function SatelliteMap({ initialBounds, children }: Props) {
  return (
    <Map
      mapLib={maplibregl}
      initialViewState={{ bounds: initialBounds }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={STYLE_URL}
      attributionControl={false}
    >
      <AttributionControl position="bottom-left" compact />
      {children}
    </Map>
  )
}
