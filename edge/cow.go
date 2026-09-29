package main

import (
	"math"
	"math/rand"
)

const metresPerDeg = 111_320.0

type Cow struct {
	Lat     float64
	Lng     float64
	Heading float64
	Speed   float64
	rng     *rand.Rand
}

func NewCow(lng, lat float64, rng *rand.Rand) *Cow {
	return &Cow{
		Lat:     lat,
		Lng:     lng,
		Heading: rng.Float64() * 2 * math.Pi,
		Speed:   1,
		rng:     rng,
	}
}

func (c *Cow) Step(dt float64) {
	c.Heading = wrap(c.Heading + (c.rng.Float64()*2-1)*0.4)

	d := c.Speed * dt
	c.Lat += d * math.Cos(c.Heading) / metresPerDeg
	c.Lng += d * math.Sin(c.Heading) / (metresPerDeg * math.Cos(c.Lat*math.Pi/180))
}

func (c *Cow) TurnAround() {
	c.Heading = wrap(c.Heading + math.Pi + (c.rng.Float64()*2-1)*0.5)
}

func (c *Cow) SteerTo(lng, lat, rate float64) {
	c.Heading = wrap(c.Heading + rate*c.BearingDiff(lng, lat))
}

func (c *Cow) BearingDiff(lng, lat float64) float64 {
	dx := (lng - c.Lng) * metresPerDeg * math.Cos(c.Lat*math.Pi/180)
	dy := (lat - c.Lat) * metresPerDeg
	diff := math.Atan2(dx, dy) - c.Heading

	for diff > math.Pi {
		diff -= 2 * math.Pi
	}
	for diff < -math.Pi {
		diff += 2 * math.Pi
	}
	return diff
}

func wrap(h float64) float64 {
	h = math.Mod(h, 2*math.Pi)
	if h < 0 {
		h += 2 * math.Pi
	}
	return h
}
