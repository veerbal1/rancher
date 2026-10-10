import { useEffect, useMemo } from 'react'
import type { ExpressionSpecification } from 'maplibre-gl'
import { Source, Layer, useMap } from '@vis.gl/react-maplibre'
import type { FeatureCollection, Point } from 'geojson'
import type { Cow } from '../useCows'
import { useSmoothCows } from './useSmoothCows'

const CUE_LAYER = 'cow-cues'
const CUE_PERIOD_MS: Record<string, number> = { audio: 1000, vibration: 600, pulse: 350 }

const COLORS: Record<string, string> = {
  inside: '#2f86eb',
  warning: '#e0a100',
  breached: '#d64545',
  moving: '#3b82f6',
}

const stateColor: ExpressionSpecification = [
  'match',
  ['get', 'state'],
  'inside', COLORS.inside,
  'warning', COLORS.warning,
  'breached', COLORS.breached,
  'moving', COLORS.moving,
  '#888',
]

const cueColor: ExpressionSpecification = ['match', ['get', 'level'], 'audio', '#facc15', 'vibration', '#f97316', '#ef4444']

function rippleAt(now: number) {
  const byLevel = (f: (phase: number) => number): ExpressionSpecification => {
    const at = (level: string) => f((now % CUE_PERIOD_MS[level]) / CUE_PERIOD_MS[level])
    return ['match', ['get', 'level'], 'audio', at('audio'), 'vibration', at('vibration'), at('pulse')]
  }
  const grow = byLevel((p) => 1 + 1.5 * p)
  const radius: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 14, ['*', 3, grow], 17, ['*', 6, grow], 20, ['*', 12, grow]]
  return { radius, opacity: byLevel((p) => 1 - p) }
}

export function CowsLayer({ cows, selectedId }: { cows: Cow[]; selectedId: string | null }) {
  const { current: mapRef } = useMap()
  const shown = useSmoothCows(cows)
  const cued = cows.some((c) => c.level !== 'none')

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map || !cued) return

    let frame = 0
    const tick = (now: number) => {
      if (map.getLayer(CUE_LAYER)) {
        const { radius, opacity } = rippleAt(now)
        map.setPaintProperty(CUE_LAYER, 'circle-radius', radius)
        map.setPaintProperty(CUE_LAYER, 'circle-stroke-opacity', opacity)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mapRef, cued])

  const points = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: shown.map((c) => ({
        type: 'Feature',
        properties: { collar_id: c.collar_id, state: c.state, level: c.level },
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      })),
    }),
    [shown],
  )

  return (
    <>
      <Source id="cows" type="geojson" data={points}>
        <Layer
          id="cow-rings"
          type="circle"
          paint={{
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 17, 6, 20, 10],
            'circle-color': stateColor,
            'circle-stroke-width': ['case', ['==', ['get', 'collar_id'], selectedId ?? ''], 3, 1.5],
            'circle-stroke-color': '#ffffff',
          }}
        />
        <Layer
          id={CUE_LAYER}
          type="circle"
          filter={['!=', ['get', 'level'], 'none']}
          paint={{ 'circle-opacity': 0, 'circle-stroke-width': 3, 'circle-stroke-color': cueColor }}
        />
      </Source>
    </>
  )
}
