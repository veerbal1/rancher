package main

import (
	"math/rand"
	"testing"
)

func TestPolygonFromRing(t *testing.T) {
	closed := PolygonFromRing([][2]float64{{0, 0}, {1, 0}, {1, 1}, {0, 0}})
	if len(closed) != 3 {
		t.Errorf("closed ring: got %d points, want 3", len(closed))
	}
	open := PolygonFromRing([][2]float64{{0, 0}, {1, 0}, {1, 1}})
	if len(open) != 3 {
		t.Errorf("open ring: got %d points, want 3", len(open))
	}
}

func TestContains(t *testing.T) {
	sq, l := square(100), lShape()
	tests := []struct {
		name  string
		fence Polygon
		pt    Point
		want  bool
	}{
		{"square centre", sq, at(50, 50), true},
		{"square 1 m inside edge", sq, at(1, 50), true},
		{"square 1 m outside edge", sq, at(-1, 50), false},
		{"square far away", sq, at(500, 500), false},
		{"L-shape left arm", l, at(25, 75), true},
		{"L-shape bottom arm", l, at(75, 25), true},
		{"L-shape notch", l, at(75, 75), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.fence.Contains(tt.pt.Lng, tt.pt.Lat); got != tt.want {
				t.Errorf("Contains = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDistanceToEdge(t *testing.T) {
	sq := square(100)
	tests := []struct {
		name string
		pt   Point
		want float64
	}{
		{"5 m inside west edge", at(5, 50), 5},
		{"centre", at(50, 50), 50},
		{"3 m outside west edge", at(-3, 50), 3},
		{"outside, nearest the corner", at(-3, -4), 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			approx(t, "DistanceToEdge", sq.DistanceToEdge(tt.pt.Lng, tt.pt.Lat), tt.want, 0.05)
		})
	}
}

func TestEvaluate(t *testing.T) {
	sq := square(100)
	tests := []struct {
		name string
		pt   Point
		want Zone
	}{
		{"centre", at(50, 50), ZoneInside},
		{"5 m from edge", at(5, 50), ZoneWarning},
		{"outside", at(-3, 50), ZoneOutside},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sq.Evaluate(tt.pt.Lng, tt.pt.Lat, 10); got != tt.want {
				t.Errorf("Evaluate = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRandomPointStaysInside(t *testing.T) {
	for name, fence := range map[string]Polygon{"square": square(100), "L-shape": lShape()} {
		t.Run(name, func(t *testing.T) {
			rng := rand.New(rand.NewSource(1))
			for i := range 1000 {
				lng, lat := fence.RandomPoint(rng)
				if !fence.Contains(lng, lat) {
					t.Fatalf("point %d (%v, %v) is outside the fence", i, lat, lng)
				}
			}
		})
	}
}

func TestCenter(t *testing.T) {
	lng, lat := square(100).Center()
	want := at(50, 50)
	approx(t, "lng", lng, want.Lng, 1e-9)
	approx(t, "lat", lat, want.Lat, 1e-9)
}
