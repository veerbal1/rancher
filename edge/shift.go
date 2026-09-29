package main

import (
	"math"
	"slices"
	"sort"
	"time"
)

const pushRate = 0.6

type Shift struct {
	ToID    string
	To      Polygon
	Hull    Polygon
	Start   time.Time
	SpeedMS float64

	origin     Point
	dirX, dirY float64
	startM     float64
	stopM      float64
}

func NewShift(toID string, from, to Polygon, start time.Time, speedMS float64) *Shift {
	hull := convexHull(append(slices.Clone(from), to...))
	fromLng, fromLat := from.Center()
	toLng, toLat := to.Center()
	s := &Shift{
		ToID:    toID,
		To:      to,
		Hull:    hull,
		Start:   start,
		SpeedMS: speedMS,
		origin:  Point{Lng: fromLng, Lat: fromLat},
	}
	dx, dy := s.metres(toLng, toLat)
	l := math.Hypot(dx, dy)
	s.dirX, s.dirY = dx/l, dy/l

	s.startM, s.stopM = math.Inf(1), math.Inf(1)
	for _, p := range hull {
		s.startM = math.Min(s.startM, s.progress(p.Lng, p.Lat))
	}
	for _, p := range to {
		s.stopM = math.Min(s.stopM, s.progress(p.Lng, p.Lat))
	}
	s.stopM = math.Max(s.startM, s.stopM)
	return s
}

func (s *Shift) WallM(now time.Time) float64 {
	elapsed := math.Max(0, now.Sub(s.Start).Seconds())
	return math.Min(s.stopM, s.startM+s.SpeedMS*elapsed)
}

func (s *Shift) Behind(lng, lat float64, now time.Time) bool {
	wall := s.WallM(now)
	return wall >= s.stopM || s.progress(lng, lat) < wall
}

func (s *Shift) progress(lng, lat float64) float64 {
	x, y := s.metres(lng, lat)
	return x*s.dirX + y*s.dirY
}

func (s *Shift) metres(lng, lat float64) (float64, float64) {
	k := metresPerDeg * math.Cos(s.origin.Lat*math.Pi/180)
	return (lng - s.origin.Lng) * k, (lat - s.origin.Lat) * metresPerDeg
}

func convexHull(pts Polygon) Polygon {
	p := slices.Clone(pts)
	sort.Slice(p, func(i, j int) bool {
		if p[i].Lng != p[j].Lng {
			return p[i].Lng < p[j].Lng
		}
		return p[i].Lat < p[j].Lat
	})
	cross := func(o, a, b Point) float64 {
		return (a.Lng-o.Lng)*(b.Lat-o.Lat) - (a.Lat-o.Lat)*(b.Lng-o.Lng)
	}

	hull := make(Polygon, 0, 2*len(p))
	for _, pt := range p {
		for len(hull) >= 2 && cross(hull[len(hull)-2], hull[len(hull)-1], pt) <= 0 {
			hull = hull[:len(hull)-1]
		}
		hull = append(hull, pt)
	}
	lower := len(hull) + 1
	for i := len(p) - 2; i >= 0; i-- {
		for len(hull) >= lower && cross(hull[len(hull)-2], hull[len(hull)-1], p[i]) <= 0 {
			hull = hull[:len(hull)-1]
		}
		hull = append(hull, p[i])
	}
	return hull[:len(hull)-1]
}
