import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Layer, Source, useMap } from '@vis.gl/react-maplibre'
import type { MapMouseEvent } from 'maplibre-gl'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { LngLat } from './geo'

const CLOSE_PX = 12

type Props = {
  active: boolean
  snapTo?: LngLat[]
  onFinish: (ring: LngLat[]) => void
}

export function DrawPaddock({ active, snapTo = [], onFinish }: Props) {
  const { current: mapRef } = useMap()
  const id = useId()
  const [points, setPoints] = useState<LngLat[]>([])
  const [cursor, setCursor] = useState<{ at: LngLat; snapped: boolean } | null>(null)
  const finish = useRef(onFinish)
  const targets = useRef(snapTo)

  useEffect(() => {
    finish.current = onFinish
    targets.current = snapTo
  }, [onFinish, snapTo])

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!active || !map) return

    let ring: LngLat[] = []
    const near = (p: LngLat, e: MapMouseEvent) => {
      const at = map.project(p)
      return Math.hypot(at.x - e.point.x, at.y - e.point.y)
    }
    const nearFirst = (e: MapMouseEvent) => ring.length >= 3 && near(ring[0], e) <= CLOSE_PX
    const snap = (e: MapMouseEvent): { at: LngLat; snapped: boolean } => {
      let best: LngLat | null = null
      let bestPx = CLOSE_PX
      for (const p of targets.current) {
        const px = near(p, e)
        if (px <= bestPx) {
          best = p
          bestPx = px
        }
      }
      return best ? { at: best, snapped: true } : { at: [e.lngLat.lng, e.lngLat.lat], snapped: false }
    }

    const onClick = (e: MapMouseEvent) => {
      if (nearFirst(e)) {
        const closed = [...ring, ring[0]]
        ring = []
        setPoints([])
        setCursor(null)
        finish.current(closed)
        return
      }
      const at = snap(e).at
      if (ring.some((p) => p[0] === at[0] && p[1] === at[1])) return
      ring = [...ring, at]
      setPoints(ring)
    }
    const onMove = (e: MapMouseEvent) => setCursor(nearFirst(e) ? { at: ring[0], snapped: true } : snap(e))

    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    map.doubleClickZoom.disable()
    map.on('click', onClick)
    map.on('mousemove', onMove)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
      map.doubleClickZoom.enable()
      canvas.style.cursor = ''
      setPoints([])
      setCursor(null)
    }
  }, [active, mapRef])

  const data = useMemo<FeatureCollection<LineString | Point>>(() => {
    const line = cursor && points.length > 0 ? [...points, cursor.at] : points
    const features: Feature<LineString | Point>[] = points.map((p, i) => ({
      type: 'Feature',
      properties: { first: i === 0 },
      geometry: { type: 'Point', coordinates: p },
    }))
    if (cursor?.snapped) features.push({ type: 'Feature', properties: { snap: true }, geometry: { type: 'Point', coordinates: cursor.at } })
    if (line.length >= 2) features.unshift({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } })
    return { type: 'FeatureCollection', features }
  }, [points, cursor])

  if (!active) return null

  return (
    <Source id={`draw-${id}`} type="geojson" data={data}>
      <Layer id={`draw-line-${id}`} type="line" filter={['==', ['geometry-type'], 'LineString']} paint={{ 'line-color': '#ffffff', 'line-width': 2 }} />
      <Layer
        id={`draw-points-${id}`}
        type="circle"
        filter={['==', ['geometry-type'], 'Point']}
        paint={{
          'circle-radius': ['case', ['has', 'snap'], 9, ['get', 'first'], 7, 4],
          'circle-color': ['case', ['has', 'snap'], '#e3fdcb', '#ffffff'],
          'circle-opacity': ['case', ['has', 'snap'], 0.6, 1],
          'circle-stroke-color': '#294e3b',
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  )
}
