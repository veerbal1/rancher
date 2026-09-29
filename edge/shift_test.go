package main

import (
	"math"
	"math/rand"
	"testing"
	"time"
)

func squareAt(x, y, sizeM float64) Polygon {
	return polygonM([2]float64{x, y}, [2]float64{x + sizeM, y}, [2]float64{x + sizeM, y + sizeM}, [2]float64{x, y + sizeM})
}

func pathM(pts ...[2]float64) []Point {
	out := make([]Point, len(pts))
	for i, xy := range pts {
		out[i] = at(xy[0], xy[1])
	}
	return out
}

func metresApart(a, b Point) float64 {
	k := metresPerDeg * math.Cos(a.Lat*math.Pi/180)
	return math.Hypot((a.Lng-b.Lng)*k, (a.Lat-b.Lat)*metresPerDeg)
}

func TestGateIsWherePathLeavesOldPaddock(t *testing.T) {
	lane := Lane{Path: pathM([2]float64{50, 50}, [2]float64{150, 50}, [2]float64{150, 200}), HalfWidthM: 4}
	if d := metresApart(lane.Gate(squareAt(0, 0, 100)), at(100, 50)); d > 0.5 {
		t.Errorf("gate is %.1f m from the east edge crossing", d)
	}

	outside := Lane{Path: pathM([2]float64{150, 50}, [2]float64{250, 50}), HalfWidthM: 4}
	if d := metresApart(outside.Gate(squareAt(0, 0, 100)), at(150, 50)); d > 0.5 {
		t.Errorf("a path that never leaves the paddock should use its first point, got %.1f m away", d)
	}
}

func TestMoveFenceZones(t *testing.T) {
	fence := NewShift("B", squareAt(0, 0, 100), squareAt(300, 0, 100), nil, 8, time.Time{}).Fence

	tests := []struct {
		name string
		x, y float64
		want Zone
	}{
		{"middle of old paddock", 50, 50, ZoneInside},
		{"old paddock edge away from the gate", 50, 1, ZoneWarning},
		{"old paddock edge at the gate", 99, 50, ZoneInside},
		{"lane centre", 200, 50, ZoneInside},
		{"lane edge", 200, 53, ZoneWarning},
		{"beside the lane", 200, 60, ZoneOutside},
		{"new paddock", 350, 50, ZoneInside},
	}
	for _, tt := range tests {
		p := at(tt.x, tt.y)
		if got := fence.Evaluate(p.Lng, p.Lat, warnM); got != tt.want {
			t.Errorf("%s: zone %d, want %d", tt.name, got, tt.want)
		}
	}
}

func TestGuidanceStartsPast60AndStopsUnder30(t *testing.T) {
	start := at(0, 0)
	target := at(0, 100)
	col := NewCollar("C", 1, "A", squareAt(-50, -50, 200), NewCow(start.Lng, start.Lat, rand.New(rand.NewSource(1))), warnM)

	steps := []struct {
		offDeg float64
		want   bool
	}{
		{45, false},
		{90, true},
		{45, true},
		{20, false},
		{45, false},
	}
	for _, s := range steps {
		col.cow.Heading = s.offDeg * math.Pi / 180
		col.guide(target.Lng, target.Lat)
		if col.guiding != s.want {
			t.Errorf("heading %v° off: guiding %v, want %v", s.offDeg, col.guiding, s.want)
		}
	}
}

func TestHerdLeavesThroughGateAndArrives(t *testing.T) {
	from, to := squareAt(0, 0, 100), squareAt(300, 50, 100)
	t0 := time.Unix(1_000, 0)
	start := t0.Add(10 * time.Second)
	shift := NewShift("B", from, to, nil, 8, start)
	const deadline = 900

	type progress struct {
		exited  bool
		arrived int
	}
	var herd []*Collar
	seen := map[int]*progress{}
	for seed := int64(1); seed <= 10; seed++ {
		rng := rand.New(rand.NewSource(seed))
		lng, lat := from.RandomPoint(rng)
		col := NewCollar("C", int(seed), "A", from, NewCow(lng, lat, rng), warnM)
		col.StartShift(shift)
		herd = append(herd, col)
		seen[col.Number] = &progress{}
	}

	for tick := 1; tick <= deadline+10; tick++ {
		now := t0.Add(time.Duration(tick) * time.Second)
		for _, col := range herd {
			col.Step(now, 1)
			p := seen[col.Number]
			if col.State() == Breached {
				t.Fatalf("cow %d breached at tick %d", col.Number, tick)
			}
			if !p.exited && !from.Contains(col.cow.Lng, col.cow.Lat) {
				p.exited = true
				if d := metresApart(Point{Lng: col.cow.Lng, Lat: col.cow.Lat}, shift.Gate); d > shift.Lane.HalfWidthM+1 {
					t.Errorf("cow %d left the old paddock %.1f m from the gate", col.Number, d)
				}
			}
			if p.arrived == 0 && col.shift == nil {
				p.arrived = tick - 10
			}
		}
	}

	for _, col := range herd {
		p := seen[col.Number]
		if p.arrived == 0 {
			t.Errorf("cow %d did not arrive within %ds", col.Number, deadline)
			continue
		}
		t.Logf("cow %d arrived after %ds", col.Number, p.arrived)
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
	shiftAB := WorldShift{ID: "S1", FromPaddockID: "A", ToPaddockID: "B", StartAt: time.Unix(1_000, 0)}

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
