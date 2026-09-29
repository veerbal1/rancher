package main

import (
	"math/rand"
	"slices"
	"testing"
	"time"
)

func squareAt(x, y, sizeM float64) Polygon {
	return polygonM([2]float64{x, y}, [2]float64{x + sizeM, y}, [2]float64{x + sizeM, y + sizeM}, [2]float64{x, y + sizeM})
}

func TestConvexHullWrapsBothPaddocks(t *testing.T) {
	from, to := squareAt(0, 0, 100), squareAt(300, 50, 100)
	hull := convexHull(append(slices.Clone(from), to...))

	for _, p := range []Point{at(50, 50), at(350, 100), at(200, 75)} {
		if !hull.Contains(p.Lng, p.Lat) {
			t.Errorf("hull should contain %v", p)
		}
	}
	if gap := at(200, 5); hull.Contains(gap.Lng, gap.Lat) {
		t.Errorf("hull should not contain the corner gap %v", gap)
	}
	if len(hull) != 6 {
		t.Errorf("hull has %d corners, want 6", len(hull))
	}
}

func TestWallSweepsFromBackToFront(t *testing.T) {
	start := time.Unix(1_000, 0)
	s := NewShift("B", squareAt(0, 0, 100), squareAt(300, 0, 100), start, 1)

	back, front := at(1, 50), at(399, 50)
	if s.Behind(back.Lng, back.Lat, start) {
		t.Error("before the start nothing should be behind the wall")
	}
	if !s.Behind(back.Lng, back.Lat, start.Add(5*time.Second)) || s.Behind(front.Lng, front.Lat, start.Add(5*time.Second)) {
		t.Error("after 5s only the back of the old paddock should be behind the wall")
	}
	if !s.Behind(front.Lng, front.Lat, start.Add(time.Hour)) {
		t.Error("by the end the wall should have swept the whole route")
	}
	if got := s.WallM(start.Add(time.Hour)); got != s.endM {
		t.Errorf("wall stopped at %.1f, want the far end %.1f", got, s.endM)
	}
}

func TestHerdShiftArrivesWithoutBreaching(t *testing.T) {
	from, to := squareAt(0, 0, 100), squareAt(300, 50, 100)
	t0 := time.Unix(1_000, 0)
	start := t0.Add(10 * time.Second)

	shift := NewShift("B", from, to, start, 0.5)
	deadline := int((shift.endM-shift.startM)/shift.SpeedMS) + 60

	var herd []*Collar
	for seed := int64(1); seed <= 10; seed++ {
		rng := rand.New(rand.NewSource(seed))
		lng, lat := from.RandomPoint(rng)
		col := NewCollar("C", int(seed), "A", from, NewCow(lng, lat, rng), warnM)
		col.StartShift(shift)
		herd = append(herd, col)
	}

	arrived := map[int]int{}
	for tick := 1; tick <= 1800 && len(arrived) < len(herd); tick++ {
		now := t0.Add(time.Duration(tick) * time.Second)
		for _, col := range herd {
			col.Step(now, 1)
			if col.State() == Breached {
				t.Fatalf("cow %d breached at tick %d", col.Number, tick)
			}
			if _, done := arrived[col.Number]; !done && col.shift == nil {
				if now.Before(start) {
					t.Fatalf("cow %d arrived before the shift started", col.Number)
				}
				arrived[col.Number] = tick
			}
		}
	}

	for _, col := range herd {
		tick, ok := arrived[col.Number]
		if !ok || tick-10 > deadline {
			t.Errorf("cow %d did not arrive within %ds of the start", col.Number, deadline)
			continue
		}
		if col.PaddockID != "B" || !to.Contains(col.cow.Lng, col.cow.Lat) {
			t.Errorf("cow %d: paddock %s, inside new paddock %v", col.Number, col.PaddockID, to.Contains(col.cow.Lng, col.cow.Lat))
		}
		t.Logf("cow %d arrived after %ds", col.Number, tick-10)
	}
}

func TestReconcileStartsShiftOnlyWhenPlanned(t *testing.T) {
	ring := func(p Polygon) [][2]float64 {
		r := make([][2]float64, 0, len(p)+1)
		for _, pt := range append(p, p[0]) {
			r = append(r, [2]float64{pt.Lng, pt.Lat})
		}
		return r
	}
	paddock := func(id string, p Polygon) WorldPaddock {
		wp := WorldPaddock{ID: id}
		wp.Polygon.Coordinates = [][][2]float64{ring(p)}
		return wp
	}
	farm := func(paddockID string, shifts ...WorldShift) WorldFarm {
		return WorldFarm{
			FarmerID: "F",
			Paddocks: []WorldPaddock{paddock("A", squareAt(0, 0, 100)), paddock("B", squareAt(300, 0, 100)), paddock("C", squareAt(0, 300, 100))},
			Collars:  []WorldCollar{{ID: "C1", Number: 1, PaddockID: &paddockID}},
			Shifts:   shifts,
		}
	}
	shiftAB := WorldShift{ID: "S1", FromPaddockID: "A", ToPaddockID: "B", StartAt: time.Unix(1_000, 0), SpeedMS: 0.5}

	tower := NewTower("F")
	tower.Reconcile(farm("A"))
	col := tower.collars["C1"]

	if r := tower.Reconcile(farm("B", shiftAB)); r.Shifted != 1 || col.shift == nil || col.PaddockID != "B" {
		t.Fatalf("planned move: result %+v, shifting %v, paddock %s", r, col.shift != nil, col.PaddockID)
	}
	if r := tower.Reconcile(farm("B", shiftAB)); r != (ReconcileResult{}) {
		t.Errorf("repeat reconcile mid-shift changed things: %+v", r)
	}
	if r := tower.Reconcile(farm("C")); r.FenceChanged != 1 || col.shift != nil {
		t.Errorf("unplanned move: result %+v, shifting %v", r, col.shift != nil)
	}
}
