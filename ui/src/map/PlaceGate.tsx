import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Layer, Source, useMap } from '@vis.gl/react-maplibre'
import type { MapMouseEvent } from 'maplibre-gl'
import type { Feature, Point } from 'geojson'
import type { LngLat } from './geo'

const CORNER_PX = 12
const FENCE_PX = 25

type Props = {
  ring: LngLat[] | null
  onPick: (at: LngLat) => void
}

export function PlaceGate({ ring, onPick }: Props) {
  const { current: mapRef } = useMap()
  const id = useId()
  const [hover, setHover] = useState<LngLat | null>(null)
  const pick = useRef(onPick)

  useEffect(() => {
    pick.current = onPick
  }, [onPick])

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!ring || !map) return

    const onFence = (e: MapMouseEvent): LngLat | null => {
      for (const p of ring) {
        const at = map.project(p)
        if (Math.hypot(at.x - e.point.x, at.y - e.point.y) <= CORNER_PX) return p
      }
      let best: LngLat | null = null
      let bestPx = FENCE_PX
      for (let i = 1; i < ring.length; i++) {
        const [a, b] = [ring[i - 1], ring[i]]
        const pa = map.project(a)
        const pb = map.project(b)
        const dx = pb.x - pa.x
        const dy = pb.y - pa.y
        const len2 = dx * dx + dy * dy
        if (len2 === 0) continue
        const t = Math.max(0, Math.min(1, ((e.point.x - pa.x) * dx + (e.point.y - pa.y) * dy) / len2))
        const d = Math.hypot(pa.x + t * dx - e.point.x, pa.y + t * dy - e.point.y)
        if (d <= bestPx) {
          best = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
          bestPx = d
        }
      }
      return best
    }

    const onMove = (e: MapMouseEvent) => setHover(onFence(e))
    const onClick = (e: MapMouseEvent) => {
      const at = onFence(e)
      if (at) pick.current(at)
    }

    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    map.on('mousemove', onMove)
    map.on('click', onClick)
    return () => {
      map.off('mousemove', onMove)
      map.off('click', onClick)
      canvas.style.cursor = ''
      setHover(null)
    }
  }, [ring, mapRef])

  const data = useMemo<Feature<Point>>(
    () => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: hover ?? [0, 0] } }),
    [hover],
  )

  if (!ring || !hover) return null

  return (
    <Source id={`gate-place-${id}`} type="geojson" data={data}>
      <Layer
        id={`gate-place-point-${id}`}
        type="circle"
        paint={{ 'circle-radius': 8, 'circle-color': '#e3fdcb', 'circle-opacity': 0.7, 'circle-stroke-color': '#294e3b', 'circle-stroke-width': 2 }}
      />
    </Source>
  )
}
