import { intersect } from '@turf/intersect'
import { area } from '@turf/area'
import { featureCollection, polygon } from '@turf/helpers'
import type { LngLat } from './geo'
import type { Paddock } from '../usePaddocks'

export type Overlap = { name: string; areaM2: number }

const MIN_OVERLAP_M2 = 1

export function findOverlaps(ring: LngLat[], paddocks: Paddock[]): Overlap[] {
  const draft = polygon([ring])
  return paddocks.flatMap((p) => {
    const shared = intersect(featureCollection([draft, polygon(p.polygon.coordinates)]))
    const areaM2 = shared ? area(shared) : 0
    return areaM2 > MIN_OVERLAP_M2 ? [{ name: p.name, areaM2 }] : []
  })
}
