import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Layer, Source, useMap } from '@vis.gl/react-maplibre'
import type { MapMouseEvent } from 'maplibre-gl'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { LngLat } from './geo'

const CLOSE_PX = 12

type Props = {
  active: boolean
  onFinish: (ring: LngLat[]) => void
}

export function DrawPaddock({ active, onFinish }: Props) {
  const { current: mapRef } = useMap()
  const id = useId()
  const [points, setPoints] = useState<LngLat[]>([])
  const [cursor, setCursor] = useState<LngLat | null>(null)
  const finish = useRef(onFinish)

  useEffect(() => {
    finish.current = onFinish
  }, [onFinish])

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!active || !map) return

    let ring: LngLat[] = []
    const nearFirst = (e: MapMouseEvent) => {
      if (ring.length < 3) return false
      const first = map.project(ring[0])
      return Math.hypot(first.x - e.point.x, first.y - e.point.y) <= CLOSE_PX
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
      ring = [...ring, [e.lngLat.lng, e.lngLat.lat]]
      setPoints(ring)
    }
    const onMove = (e: MapMouseEvent) => setCursor(nearFirst(e) ? ring[0] : [e.lngLat.lng, e.lngLat.lat])

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
    const line = cursor && points.length > 0 ? [...points, cursor] : points
    const features: Feature<LineString | Point>[] = points.map((p, i) => ({
      type: 'Feature',
      properties: { first: i === 0 },
      geometry: { type: 'Point', coordinates: p },
    }))
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
          'circle-radius': ['case', ['get', 'first'], 7, 4],
          'circle-color': '#ffffff',
          'circle-stroke-color': '#2e9e5b',
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  )
}
