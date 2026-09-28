// The sim works in metres from the fence's south-west corner (x east, y north).
// Maps work in [lng, lat], so that corner is pinned to a real dairy paddock
// near Morrinsville, Waikato, NZ.
const ORIGIN = { lat: -37.68, lng: 175.56 }
const METRES_PER_DEG_LAT = 111_320

export type LngLat = [number, number]

export function toLngLat(x: number, y: number): LngLat {
  const lat = ORIGIN.lat + y / METRES_PER_DEG_LAT
  const lng = ORIGIN.lng + x / (METRES_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180))
  return [lng, lat]
}

// Closed ring around the square min..max (in sim metres), as [lng, lat] points.
export function square(min: number, max: number): LngLat[] {
  return [
    [min, min],
    [max, min],
    [max, max],
    [min, max],
    [min, min],
  ].map(([x, y]) => toLngLat(x, y))
}
