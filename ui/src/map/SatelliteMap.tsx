import type { ReactNode } from 'react'
import { Map } from '@vis.gl/react-maplibre'
import * as maplibregl from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre looks for its worker next to its own file, which Vite moves when
// bundling — so let Vite build the worker and hand MapLibre its URL.
// <Map mapLib={maplibregl}> below makes the map use this same configured copy.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

const STYLE_URL = `https://maps.geo.ap-south-1.amazonaws.com/v2/styles/Hybrid/descriptor?key=${import.meta.env.VITE_LOCATION_KEY}`

type Props = {
  initialBounds: LngLatBoundsLike
  children?: ReactNode
}

// Fills its parent with an Amazon Location satellite map. It knows nothing about
// cows or fences: those are drawn by layer components passed in as children.
export function SatelliteMap({ initialBounds, children }: Props) {
  return (
    <Map
      mapLib={maplibregl}
      initialViewState={{ bounds: initialBounds }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={STYLE_URL}
    >
      {children}
    </Map>
  )
}
