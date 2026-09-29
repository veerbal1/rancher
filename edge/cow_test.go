package main

import (
	"math"
	"math/rand"
	"testing"
)

func TestCowStepMovesOneMetre(t *testing.T) {
	start := at(0, 0)
	c := NewCow(start.Lng, start.Lat, rand.New(rand.NewSource(1)))
	for i := range 50 {
		before := Point{Lng: c.Lng, Lat: c.Lat}
		c.Step(1)
		approx(t, "step distance", distanceM(before, Point{Lng: c.Lng, Lat: c.Lat}), 1, 1e-6)
		if t.Failed() {
			t.Fatalf("failed at step %d", i)
		}
	}
}

func TestSteerTo(t *testing.T) {
	origin := at(0, 0)
	newCow := func(heading float64) *Cow {
		c := NewCow(origin.Lng, origin.Lat, rand.New(rand.NewSource(1)))
		c.Heading = heading
		return c
	}

	t.Run("full rate turns to face the target", func(t *testing.T) {
		c := newCow(0)
		east := at(100, 0)
		c.SteerTo(east.Lng, east.Lat, 1)
		approx(t, "heading", c.Heading, math.Pi/2, 1e-3)
	})

	t.Run("turns the short way round", func(t *testing.T) {
		c := newCow(math.Pi / 2)
		northWest := at(-100, 100)
		c.SteerTo(northWest.Lng, northWest.Lat, 0.5)
		approx(t, "heading", c.Heading, math.Pi/8, 1e-3)
	})
}
