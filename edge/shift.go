package main

import (
	"math"
	"time"
)

const (
	cueStartRad = 60 * math.Pi / 180
	cueStopRad  = 30 * math.Pi / 180
	guideRate   = 0.6
	followRate  = 0.3
	lookaheadM  = 5.0
	driftStartM = 1.5
	driftStopM  = 1.0
	gateNearM   = 10.0
)

type Shift struct {
	ToID  string
	From  Polygon
	To    Polygon
	Lane  Lane
	Gate  Point
	gateM float64
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
	gate := lane.Gate(from)
	_, gateM, _ := lane.nearest(gate.Lng, gate.Lat)
	return &Shift{
		ToID:  toID,
		From:  from,
		To:    to,
		Lane:  lane,
		Gate:  gate,
		gateM: gateM,
		Fence: MoveFence{From: from, To: to, Lane: lane},
		Start: start,
	}
}

func (s *Shift) Guide(lng, lat float64) (targetLng, targetLat, driftM float64) {
	switch {
	case s.From.Contains(lng, lat) && metresBetween(lng, lat, s.Gate) > gateNearM:
		return s.Gate.Lng, s.Gate.Lat, 0
	case s.From.Contains(lng, lat):
		through := s.Lane.PointAt(s.gateM + lookaheadM)
		return through.Lng, through.Lat, 0
	case s.To.Contains(lng, lat):
		targetLng, targetLat = s.To.Center()
		return targetLng, targetLat, 0
	}
	driftM, alongM, _ := s.Lane.nearest(lng, lat)
	ahead := s.Lane.PointAt(alongM + lookaheadM)
	return ahead.Lng, ahead.Lat, driftM
}
