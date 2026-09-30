package main

import "math"

const defaultLaneWidthM = 8.0

type Fence interface {
	Contains(lng, lat float64) bool
	Walls(lng, lat float64) []Point
	Home(lng, lat float64) (float64, float64)
}

func (p Polygon) Home(float64, float64) (float64, float64) { return p.Center() }

type Lane struct {
	Path       []Point
	HalfWidthM float64
}

func (l Lane) DistanceM(lng, lat float64) float64 {
	d, _, _ := l.nearest(lng, lat)
	return d
}

func (l Lane) Nearest(lng, lat float64) Point {
	_, _, p := l.nearest(lng, lat)
	return p
}

func (l Lane) nearest(lng, lat float64) (distM, alongM float64, p Point) {
	k := metresPerDeg * math.Cos(lat*math.Pi/180)
	distM = math.Inf(1)
	walked := 0.0
	for i := 0; i+1 < len(l.Path); i++ {
		a, b := l.Path[i], l.Path[i+1]
		ax, ay := (a.Lng-lng)*k, (a.Lat-lat)*metresPerDeg
		bx, by := (b.Lng-lng)*k, (b.Lat-lat)*metresPerDeg
		dx, dy := bx-ax, by-ay
		segM := math.Hypot(dx, dy)
		t := 0.0
		if segM > 0 {
			t = math.Max(0, math.Min(1, -(ax*dx+ay*dy)/(segM*segM)))
		}
		if d := math.Hypot(ax+t*dx, ay+t*dy); d < distM {
			distM, alongM = d, walked+t*segM
			p = Point{Lng: a.Lng + t*(b.Lng-a.Lng), Lat: a.Lat + t*(b.Lat-a.Lat)}
		}
		walked += segM
	}
	return distM, alongM, p
}

func (l Lane) PointAt(alongM float64) Point {
	k := metresPerDeg * math.Cos(l.Path[0].Lat*math.Pi/180)
	for i := 0; i+1 < len(l.Path); i++ {
		a, b := l.Path[i], l.Path[i+1]
		segM := math.Hypot((b.Lng-a.Lng)*k, (b.Lat-a.Lat)*metresPerDeg)
		if alongM <= segM && segM > 0 {
			t := math.Max(0, alongM/segM)
			return Point{Lng: a.Lng + t*(b.Lng-a.Lng), Lat: a.Lat + t*(b.Lat-a.Lat)}
		}
		alongM -= segM
	}
	return l.Path[len(l.Path)-1]
}

func (l Lane) Gate(from Polygon) Point {
	for i := 0; i+1 < len(l.Path); i++ {
		a, b := l.Path[i], l.Path[i+1]
		if !from.Contains(a.Lng, a.Lat) || from.Contains(b.Lng, b.Lat) {
			continue
		}
		if p, ok := firstCrossing(a, b, from); ok {
			return p
		}
	}
	return l.Path[0]
}

func firstCrossing(a, b Point, poly Polygon) (Point, bool) {
	best, found := math.Inf(1), false
	for i := range poly {
		if t, ok := segmentHit(a, b, poly[i], poly[(i+1)%len(poly)]); ok && t < best {
			best, found = t, true
		}
	}
	return Point{Lng: a.Lng + best*(b.Lng-a.Lng), Lat: a.Lat + best*(b.Lat-a.Lat)}, found
}

func segmentHit(a, b, c, d Point) (float64, bool) {
	rx, ry := b.Lng-a.Lng, b.Lat-a.Lat
	sx, sy := d.Lng-c.Lng, d.Lat-c.Lat
	den := rx*sy - ry*sx
	if den == 0 {
		return 0, false
	}
	qx, qy := c.Lng-a.Lng, c.Lat-a.Lat
	t := (qx*sy - qy*sx) / den
	u := (qx*ry - qy*rx) / den
	return t, t >= 0 && t <= 1 && u >= 0 && u <= 1
}

type MoveFence struct {
	From Polygon
	To   Polygon
	Lane Lane
}

func (m MoveFence) Contains(lng, lat float64) bool {
	return m.From.Contains(lng, lat) || m.To.Contains(lng, lat) || m.Lane.DistanceM(lng, lat) <= m.Lane.HalfWidthM
}

func (m MoveFence) Walls(lng, lat float64) []Point {
	switch {
	case m.From.Contains(lng, lat):
		return m.outsideLane(m.From.Walls(lng, lat))
	case m.To.Contains(lng, lat):
		return m.outsideLane(m.To.Walls(lng, lat))
	case m.Lane.DistanceM(lng, lat) <= m.Lane.HalfWidthM:
		return m.Lane.sideWalls(lng, lat)
	}
	return nil
}

func (m MoveFence) outsideLane(walls []Point) []Point {
	kept := walls[:0]
	for _, w := range walls {
		if m.Lane.DistanceM(w.Lng, w.Lat) > m.Lane.HalfWidthM {
			kept = append(kept, w)
		}
	}
	return kept
}

func (l Lane) sideWalls(lng, lat float64) []Point {
	_, alongM, p := l.nearest(lng, lat)
	a, b := l.PointAt(math.Max(0, alongM-0.5)), l.PointAt(alongM+0.5)
	k := metresPerDeg * math.Cos(p.Lat*math.Pi/180)
	dx, dy := (b.Lng-a.Lng)*k, (b.Lat-a.Lat)*metresPerDeg
	n := math.Hypot(dx, dy)
	if n == 0 {
		return nil
	}
	ox, oy := -dy/n*l.HalfWidthM, dx/n*l.HalfWidthM
	return []Point{
		{Lng: p.Lng + ox/k, Lat: p.Lat + oy/metresPerDeg},
		{Lng: p.Lng - ox/k, Lat: p.Lat - oy/metresPerDeg},
	}
}

func (m MoveFence) Home(lng, lat float64) (float64, float64) {
	switch {
	case m.From.Contains(lng, lat):
		return m.From.Center()
	case m.To.Contains(lng, lat):
		return m.To.Center()
	default:
		p := m.Lane.Nearest(lng, lat)
		return p.Lng, p.Lat
	}
}
