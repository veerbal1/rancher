package main

import (
	"math"
	"math/rand"
)

type Point struct {
	Lng float64
	Lat float64
}

type Polygon []Point

func PolygonFromRing(ring [][2]float64) Polygon {
	p := make(Polygon, 0, len(ring))
	for _, c := range ring {
		p = append(p, Point{Lng: c[0], Lat: c[1]})
	}
	if n := len(p); n > 1 && p[0] == p[n-1] {
		p = p[:n-1]
	}
	return p
}

func (p Polygon) Contains(lng, lat float64) bool {
	inside := false
	for i, j := 0, len(p)-1; i < len(p); j, i = i, i+1 {
		a, b := p[i], p[j]
		if (a.Lat > lat) != (b.Lat > lat) && lng < (b.Lng-a.Lng)*(lat-a.Lat)/(b.Lat-a.Lat)+a.Lng {
			inside = !inside
		}
	}
	return inside
}

func (p Polygon) DistanceToEdge(lng, lat float64) float64 {
	k := metresPerDeg * math.Cos(lat*math.Pi/180)
	best := math.Inf(1)
	for i := range p {
		a, b := p[i], p[(i+1)%len(p)]
		ax, ay := (a.Lng-lng)*k, (a.Lat-lat)*metresPerDeg
		bx, by := (b.Lng-lng)*k, (b.Lat-lat)*metresPerDeg
		dx, dy := bx-ax, by-ay
		t := 0.0
		if l := dx*dx + dy*dy; l > 0 {
			t = math.Max(0, math.Min(1, -(ax*dx+ay*dy)/l))
		}
		best = math.Min(best, math.Hypot(ax+t*dx, ay+t*dy))
	}
	return best
}

func (p Polygon) Walls(lng, lat float64) []Point {
	walls := make([]Point, 0, len(p))
	for i := range p {
		walls = append(walls, nearestOnSegment(p[i], p[(i+1)%len(p)], lng, lat))
	}
	return walls
}

func nearestOnSegment(a, b Point, lng, lat float64) Point {
	k := metresPerDeg * math.Cos(lat*math.Pi/180)
	ax, ay := (a.Lng-lng)*k, (a.Lat-lat)*metresPerDeg
	bx, by := (b.Lng-lng)*k, (b.Lat-lat)*metresPerDeg
	dx, dy := bx-ax, by-ay
	t := 0.0
	if l := dx*dx + dy*dy; l > 0 {
		t = math.Max(0, math.Min(1, -(ax*dx+ay*dy)/l))
	}
	return Point{Lng: a.Lng + t*(b.Lng-a.Lng), Lat: a.Lat + t*(b.Lat-a.Lat)}
}

func metresBetween(lng, lat float64, p Point) float64 {
	k := metresPerDeg * math.Cos(lat*math.Pi/180)
	return math.Hypot((p.Lng-lng)*k, (p.Lat-lat)*metresPerDeg)
}

func (p Polygon) Center() (float64, float64) {
	var lng, lat float64
	for _, pt := range p {
		lng += pt.Lng
		lat += pt.Lat
	}
	return lng / float64(len(p)), lat / float64(len(p))
}

func (p Polygon) RandomPoint(rng *rand.Rand) (float64, float64) {
	minLng, minLat, maxLng, maxLat := p[0].Lng, p[0].Lat, p[0].Lng, p[0].Lat
	for _, pt := range p {
		minLng, maxLng = math.Min(minLng, pt.Lng), math.Max(maxLng, pt.Lng)
		minLat, maxLat = math.Min(minLat, pt.Lat), math.Max(maxLat, pt.Lat)
	}
	for range 100 {
		lng := minLng + rng.Float64()*(maxLng-minLng)
		lat := minLat + rng.Float64()*(maxLat-minLat)
		if p.Contains(lng, lat) {
			return lng, lat
		}
	}
	return p.Center()
}

type Zone int

const (
	ZoneInside Zone = iota
	ZoneWarning
	ZoneOutside
)

func (p Polygon) Evaluate(lng, lat, warnM float64) Zone {
	if !p.Contains(lng, lat) {
		return ZoneOutside
	}
	if p.DistanceToEdge(lng, lat) <= warnM {
		return ZoneWarning
	}
	return ZoneInside
}
