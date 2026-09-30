import { useEffect, useMemo, useState } from 'react'
import type { ExpressionSpecification } from 'maplibre-gl'
import { Source, Layer, useMap } from '@vis.gl/react-maplibre'
import type { FeatureCollection, Point } from 'geojson'
import type { Cow } from '../useCows'
import { useSmoothCows } from './useSmoothCows'

const COW_IMAGE = 'cow'
const EMITTER_IMAGE = 'emitter'
const EMITTER_OFFSETS: Record<string, [number, number][]> = {
  left: [[-9, -20]],
  right: [[9, -20]],
  both: [[-9, -20], [9, -20]],
}
const iconSize: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 14, 0.25, 17, 0.5, 20, 1]

function emitterImage() {
  const size = 24
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = '#f59e0b'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  return ctx.getImageData(0, 0, size, size)
}
const CUE_LAYER = 'cow-cues'
const CUE_PERIOD_MS: Record<string, number> = { audio: 1000, vibration: 600, pulse: 350 }

const COLORS: Record<string, string> = {
  inside: '#2e9e5b',
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
  const radius: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 14, ['*', 7, grow], 17, ['*', 14, grow], 20, ['*', 28, grow]]
  return { radius, opacity: byLevel((p) => 1 - p) }
}

export function CowsLayer({ cows }: { cows: Cow[] }) {
  const { current: mapRef } = useMap()
  const [imageReady, setImageReady] = useState(false)
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
      if (!map.hasImage(EMITTER_IMAGE)) map.addImage(EMITTER_IMAGE, emitterImage(), { pixelRatio: 2 })
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
        properties: { collar_id: c.collar_id, state: c.state, level: c.level, heading: c.heading },
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      })),
    }),
    [shown],
  )

  const emitters = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: shown.flatMap((c) =>
        (EMITTER_OFFSETS[c.side ?? 'none'] ?? []).map((offset) => ({
          type: 'Feature' as const,
          properties: { heading: c.heading, offset },
          geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
        })),
      ),
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
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 7, 17, 14, 20, 28],
            'circle-color': stateColor,
            'circle-opacity': 0.35,
            'circle-stroke-width': 2,
            'circle-stroke-color': stateColor,
          }}
        />
        <Layer
          id={CUE_LAYER}
          type="circle"
          filter={['!=', ['get', 'level'], 'none']}
          paint={{ 'circle-opacity': 0, 'circle-stroke-width': 3, 'circle-stroke-color': cueColor }}
        />
        {imageReady && (
          <Layer
            id="cow-icons"
            type="symbol"
            layout={{
              'icon-image': COW_IMAGE,
              'icon-size': iconSize,
              'icon-rotate': ['get', 'heading'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
        )}
      </Source>
      {imageReady && (
        <Source id="cow-emitters" type="geojson" data={emitters}>
          <Layer
            id="cow-emitter-dots"
            type="symbol"
            layout={{
              'icon-image': EMITTER_IMAGE,
              'icon-size': iconSize,
              'icon-offset': ['array', 'number', 2, ['get', 'offset']],
              'icon-rotate': ['get', 'heading'],
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
        </Source>
      )}
    </>
  )
}
