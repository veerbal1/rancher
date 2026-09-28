import { useEffect, useMemo, useState } from 'react'
import { Map, Source, Layer } from '@vis.gl/react-maplibre'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { FeatureCollection, LineString, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre looks for its worker next to its own file, which Vite moves when
// bundling — so let Vite build the worker and hand MapLibre its URL.
// <Map mapLib={maplibregl}> below makes the map use this same configured copy.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

type Cow = {
  sim_id: string
  seq: number
  time: string
  cow_id: string
  x: number
  y: number
  state: string
  level: string
}

const API_URL = import.meta.env.VITE_API_URL
const LOCATION_KEY = import.meta.env.VITE_LOCATION_KEY
const MAP_STYLE = `https://maps.geo.ap-south-1.amazonaws.com/v2/styles/Hybrid/descriptor?key=${LOCATION_KEY}`

// The sim's (0, 0) — the fence's south-west corner — placed on a dairy paddock
// near Morrinsville, Waikato, NZ.
const ORIGIN = { lat: -37.68, lng: 175.56 }
const METRES_PER_DEG_LAT = 111_320

const COLORS: Record<string, string> = {
  inside: '#2e9e5b',
  warning: '#e0a100',
  breached: '#d64545',
}

// Sim positions are metres east (x) and north (y) of ORIGIN; maps want [lng, lat].
function toLngLat(x: number, y: number): [number, number] {
  const lat = ORIGIN.lat + y / METRES_PER_DEG_LAT
  const lng = ORIGIN.lng + x / (METRES_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180))
  return [lng, lat]
}

function square(min: number, max: number): [number, number][] {
  return [
    [min, min],
    [max, min],
    [max, max],
    [min, max],
    [min, min],
  ].map(([x, y]) => toLngLat(x, y))
}

const FENCE: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { kind: 'fence' }, geometry: { type: 'LineString', coordinates: square(0, 100) } },
    // warning zone starts 10 m inside the fence
    { type: 'Feature', properties: { kind: 'warning' }, geometry: { type: 'LineString', coordinates: square(10, 90) } },
  ],
}

function App() {
  const [cows, setCows] = useState<Cow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}?farm=sim-1`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setCows(await res.json())
        setError('')
      } catch (e) {
        setError(String(e))
      }
    }

    load()
    const id = setInterval(load, 1000)
    return () => clearInterval(id)
  }, [])

  const cowPoints = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: cows.map((c) => ({
        type: 'Feature',
        properties: { cow_id: c.cow_id, state: c.state },
        geometry: { type: 'Point', coordinates: toLngLat(c.x, c.y) },
      })),
    }),
    [cows],
  )

  return (
    <main>
      <h1>sim-1: {cows.length} cows</h1>
      {error && <p>{error}</p>}

      <Map
        mapLib={maplibregl}
        initialViewState={{ bounds: [toLngLat(-40, -40), toLngLat(140, 140)] }}
        style={{ width: '100%', height: '70vh' }}
        mapStyle={MAP_STYLE}
      >
        <Source id="fence" type="geojson" data={FENCE}>
          <Layer
            id="fence-line"
            type="line"
            filter={['==', ['get', 'kind'], 'fence']}
            paint={{ 'line-color': '#ffffff', 'line-width': 3 }}
          />
          <Layer
            id="warning-line"
            type="line"
            filter={['==', ['get', 'kind'], 'warning']}
            paint={{ 'line-color': '#ffd166', 'line-width': 1.5, 'line-dasharray': [2, 2] }}
          />
        </Source>

        <Source id="cows" type="geojson" data={cowPoints}>
          <Layer
            id="cow-dots"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': [
                'match',
                ['get', 'state'],
                'inside', COLORS.inside,
                'warning', COLORS.warning,
                'breached', COLORS.breached,
                '#888',
              ],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
        </Source>
      </Map>

      <ul>
        {cows.map((c) => (
          <li key={c.cow_id}>
            {c.cow_id} ({c.x.toFixed(1)}, {c.y.toFixed(1)}) {c.state}/{c.level} · seq {c.seq}
          </li>
        ))}
      </ul>
    </main>
  )
}

export default App
