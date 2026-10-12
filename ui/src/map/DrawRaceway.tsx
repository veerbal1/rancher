import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Layer, Source, useMap } from '@vis.gl/react-maplibre'
import type { MapMouseEvent } from 'maplibre-gl'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { LngLat } from './geo'

const POINT_PX = 12
const LINE_PX = 10
const ROAD_PX = 20

type Props = {
  active: boolean
  snapPoints?: LngLat[]
  snapLines?: [LngLat, LngLat][]
  roadLines?: [LngLat, LngLat][]
  onFinish: (path: LngLat[]) => void
}

export function DrawRaceway({ active, snapPoints = [], snapLines = [], roadLines = [], onFinish }: Props) {
  const { current: mapRef } = useMap()
  const id = useId()
  const [points, setPoints] = useState<LngLat[]>([])
  const [cursor, setCursor] = useState<{ at: LngLat; snapped: boolean } | null>(null)
  const finish = useRef(onFinish)
  const targets = useRef({ points: snapPoints, lines: snapLines, roads: roadLines })

  useEffect(() => {
    finish.current = onFinish
    targets.current = { points: snapPoints, lines: snapLines, roads: roadLines }
  }, [onFinish, snapPoints, snapLines, roadLines])

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!active || !map) return

    let path: LngLat[] = []
    const px = (p: LngLat, e: MapMouseEvent) => {
      const at = map.project(p)
      return Math.hypot(at.x - e.point.x, at.y - e.point.y)
    }
    const nearLast = (e: MapMouseEvent) => path.length >= 2 && px(path[path.length - 1], e) <= POINT_PX

    const snap = (e: MapMouseEvent): { at: LngLat; snapped: boolean } => {
      let best: LngLat | null = null
      let bestPx = POINT_PX
      for (const p of targets.current.points) {
        const d = px(p, e)
        if (d <= bestPx) {
          best = p
          bestPx = d
        }
      }
      if (best) return { at: best, snapped: true }

      const onLine = (lines: [LngLat, LngLat][], maxPx: number) => {
        let found: LngLat | null = null
        let foundPx = maxPx
        for (const [a, b] of lines) {
          const pa = map.project(a)
          const pb = map.project(b)
          const dx = pb.x - pa.x
          const dy = pb.y - pa.y
          const len2 = dx * dx + dy * dy
          if (len2 === 0) continue
          const t = Math.max(0, Math.min(1, ((e.point.x - pa.x) * dx + (e.point.y - pa.y) * dy) / len2))
          const d = Math.hypot(pa.x + t * dx - e.point.x, pa.y + t * dy - e.point.y)
          if (d <= foundPx) {
            found = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
            foundPx = d
          }
        }
        return found
      }
      best = onLine(targets.current.roads, ROAD_PX) ?? onLine(targets.current.lines, LINE_PX)
      return best ? { at: best, snapped: true } : { at: [e.lngLat.lng, e.lngLat.lat], snapped: false }
    }

    const done = () => {
      const finished = path
      path = []
      setPoints([])
      setCursor(null)
      finish.current(finished)
    }

    const onClick = (e: MapMouseEvent) => {
      if (nearLast(e)) return done()
      const at = snap(e).at
      const last = path[path.length - 1]
      if (last && last[0] === at[0] && last[1] === at[1]) return
      path = [...path, at]
      setPoints(path)
    }
    const onMove = (e: MapMouseEvent) => setCursor(nearLast(e) ? { at: path[path.length - 1], snapped: true } : snap(e))
    const onKey = (e: KeyboardEvent) => e.key === 'Enter' && path.length >= 2 && done()

    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    map.doubleClickZoom.disable()
    map.on('click', onClick)
    map.on('mousemove', onMove)
    window.addEventListener('keydown', onKey)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
      window.removeEventListener('keydown', onKey)
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
      properties: { last: i === points.length - 1 },
      geometry: { type: 'Point', coordinates: p },
    }))
    if (cursor?.snapped) features.push({ type: 'Feature', properties: { snap: true }, geometry: { type: 'Point', coordinates: cursor.at } })
    if (line.length >= 2) features.unshift({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } })
    return { type: 'FeatureCollection', features }
  }, [points, cursor])

  if (!active) return null

  return (
    <Source id={`raceway-draw-${id}`} type="geojson" data={data}>
      <Layer
        id={`raceway-draw-line-${id}`}
        type="line"
        filter={['==', ['geometry-type'], 'LineString']}
        paint={{ 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 1] }}
      />
      <Layer
        id={`raceway-draw-points-${id}`}
        type="circle"
        filter={['==', ['geometry-type'], 'Point']}
        paint={{
          'circle-radius': ['case', ['has', 'snap'], 9, ['get', 'last'], 7, 4],
          'circle-color': ['case', ['has', 'snap'], '#e3fdcb', '#ffffff'],
          'circle-opacity': ['case', ['has', 'snap'], 0.6, 1],
          'circle-stroke-color': '#294e3b',
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  )
}
