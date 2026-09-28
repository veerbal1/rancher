const ORIGIN = { lat: -37.68, lng: 175.56 }
const METRES_PER_DEG_LAT = 111_320

export type LngLat = [number, number]

export function toLngLat(x: number, y: number): LngLat {
  const lat = ORIGIN.lat + y / METRES_PER_DEG_LAT
  const lng = ORIGIN.lng + x / (METRES_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180))
  return [lng, lat]
}
