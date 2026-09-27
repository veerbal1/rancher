package main

import (
	"math"
	"math/rand"
)

type Cow struct {
	ID      string
	X       float64
	Y       float64
	Heading float64
	Speed   float64
	rng     *rand.Rand
}

func NewCow(id string, x, y float64, seed int64) *Cow {
	rng := rand.New(rand.NewSource(seed))
	return &Cow{
		ID:      id,
		X:       x,
		Y:       y,
		Heading: rng.Float64() * 2 * math.Pi,
		Speed:   1,
		rng:     rng,
	}
}

func (c *Cow) Step(dt float64) {
	c.Heading += (c.rng.Float64()*2 - 1) * 0.4
	c.Heading = wrap(c.Heading)

	c.X += c.Speed * dt * math.Sin(c.Heading)
	c.Y += c.Speed * dt * math.Cos(c.Heading)
}

func (c *Cow) TurnAround() {
	c.Heading = wrap(c.Heading + math.Pi + (c.rng.Float64()*2-1)*0.5)
}

func (c *Cow) SteerTo(x, y, rate float64) {
	target := math.Atan2(x-c.X, y-c.Y)
	diff := target - c.Heading

	for diff > math.Pi {
		diff -= 2 * math.Pi
	}
	for diff < -math.Pi {
		diff += 2 * math.Pi
	}

	c.Heading = wrap(c.Heading + rate*diff)
}

func wrap(h float64) float64 {
	h = math.Mod(h, 2*math.Pi)
	if h < 0 {
		h += 2 * math.Pi
	}
	return h
}
