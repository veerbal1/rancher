package main

import (
	"math"
	"math/rand"
)

const (
	metresPerDeg = 111_320.0
	grazeWander  = 0.15
	laneWander   = 0.08
	commitTicks  = 8
	commitSpeed  = 1.5
)

type Cow struct {
	Lat     float64
	Lng     float64
	Heading float64
	Speed   float64
	Wander  float64
	commit  int
	rng     *rand.Rand
}

func NewCow(lng, lat float64, rng *rand.Rand) *Cow {
	return &Cow{
		Lat:     lat,
		Lng:     lng,
		Heading: rng.Float64() * 2 * math.Pi,
		Speed:   1,
		Wander:  grazeWander,
		rng:     rng,
	}
}

func (c *Cow) Step(dt float64) {
	wander, speed := c.Wander, c.Speed
	if c.commit > 0 {
		c.commit--
		wander, speed = math.Min(wander, laneWander), speed*commitSpeed
	}
	c.Heading = wrap(c.Heading + (c.rng.Float64()*2-1)*wander)

	d := speed * dt
	c.Lat += d * math.Cos(c.Heading) / metresPerDeg
	c.Lng += d * math.Sin(c.Heading) / (metresPerDeg * math.Cos(c.Lat*math.Pi/180))
}

func (c *Cow) Startle() { c.commit = commitTicks }

func (c *Cow) TurnFrom(side Side, rad float64) {
	switch side {
	case SideLeft:
		c.Heading = wrap(c.Heading + rad)
	case SideRight:
		c.Heading = wrap(c.Heading - rad)
	case SideBoth:
		c.Heading = wrap(c.Heading + math.Pi + (c.rng.Float64()*2-1)*0.3)
	}
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
