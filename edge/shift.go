package main

import (
	"math"
	"time"
)

const (
	cueStartRad = 60 * math.Pi / 180
	cueStopRad  = 30 * math.Pi / 180
	guideRate   = 0.6
)

type Shift struct {
	ToID  string
	From  Polygon
	To    Polygon
	Lane  Lane
	Gate  Point
	Fence MoveFence
	Start time.Time
}

func NewShift(toID string, from, to Polygon, path []Point, widthM float64, start time.Time) *Shift {
	if len(path) < 2 {
		fromLng, fromLat := from.Center()
		toLng, toLat := to.Center()
		path = []Point{{Lng: fromLng, Lat: fromLat}, {Lng: toLng, Lat: toLat}}
	}
	if widthM <= 0 {
		widthM = defaultLaneWidthM
	}
	lane := Lane{Path: path, HalfWidthM: widthM / 2}
	return &Shift{
		ToID:  toID,
		From:  from,
		To:    to,
		Lane:  lane,
		Gate:  lane.Gate(from),
		Fence: MoveFence{From: from, To: to, Lane: lane},
		Start: start,
	}
}

func (s *Shift) Target(lng, lat float64) (float64, float64) {
	if s.From.Contains(lng, lat) {
		return s.Gate.Lng, s.Gate.Lat
	}
	return s.To.Center()
}
