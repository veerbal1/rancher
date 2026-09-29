import type { LngLat } from './geo'

const METRES_PER_DEG = 111_320

type XY = [number, number]

export type ShiftGeometry = {
  hull: LngLat[]
  endsAt: number
  wallAt: (now: number) => LngLat[] | null
}

export function shiftGeometry(fromRing: LngLat[], toRing: LngLat[], startAt: number, speedMs: number): ShiftGeometry {
  const from = openRing(fromRing)
  const to = openRing(toRing)
  const hull = convexHull([...from, ...to])

  const origin = center(from)
  const k = METRES_PER_DEG * Math.cos((origin[1] * Math.PI) / 180)
  const toXY = ([lng, lat]: LngLat): XY => [(lng - origin[0]) * k, (lat - origin[1]) * METRES_PER_DEG]
  const toLngLat = ([x, y]: XY): LngLat => [origin[0] + x / k, origin[1] + y / METRES_PER_DEG]

  const [tx, ty] = toXY(center(to))
  const len = Math.hypot(tx, ty)
  const [dx, dy] = [tx / len, ty / len]
  const progress = ([x, y]: XY) => x * dx + y * dy
  const lateral = ([x, y]: XY) => y * dx - x * dy

  const hullXY = hull.map(toXY)
  const startM = Math.min(...hullXY.map(progress))
  const stopM = Math.max(startM, Math.min(...to.map(toXY).map(progress)))

  const wallAt = (now: number) => {
    const elapsed = Math.max(0, (now - startAt) / 1000)
    const w = Math.min(stopM, startM + speedMs * elapsed)
    const hits: XY[] = []
    hullXY.forEach((a, i) => {
      const b = hullXY[(i + 1) % hullXY.length]
      const pa = progress(a)
      const pb = progress(b)
      if (pa === pb || (pa - w) * (pb - w) > 0) return
      const t = (w - pa) / (pb - pa)
      hits.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    })
    if (hits.length < 2) return null
    hits.sort((a, b) => lateral(a) - lateral(b))
    return [toLngLat(hits[0]), toLngLat(hits[hits.length - 1])]
  }

  return { hull, endsAt: startAt + ((stopM - startM) / speedMs) * 1000, wallAt }
}

function openRing(ring: LngLat[]): LngLat[] {
  const [first, last] = [ring[0], ring[ring.length - 1]]
  return ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
}

function center(pts: LngLat[]): LngLat {
  const sum = pts.reduce(([a, b], [lng, lat]) => [a + lng, b + lat], [0, 0])
  return [sum[0] / pts.length, sum[1] / pts.length]
}

function convexHull(pts: LngLat[]): LngLat[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: LngLat, a: LngLat, b: LngLat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const hull: LngLat[] = []
  for (const pt of p) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], pt) <= 0) hull.pop()
    hull.push(pt)
  }
  const lower = hull.length + 1
  for (let i = p.length - 2; i >= 0; i--) {
    while (hull.length >= lower && cross(hull[hull.length - 2], hull[hull.length - 1], p[i]) <= 0) hull.pop()
    hull.push(p[i])
  }
  return hull.slice(0, -1)
}
