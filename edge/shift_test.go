package main

import (
	"fmt"
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

func TestMoveFenceContainsAndWalls(t *testing.T) {
	fence := NewShift("B", squareAt(0, 0, 100), squareAt(300, 0, 100), nil, 8, time.Time{}).Fence

	contains := []struct {
		name string
		x, y float64
		want bool
	}{
		{"old paddock", 50, 50, true},
		{"lane centre", 200, 50, true},
		{"lane edge", 200, 53.5, true},
		{"beside the lane", 200, 60, false},
		{"new paddock", 350, 50, true},
	}
	for _, tt := range contains {
		p := at(tt.x, tt.y)
		if got := fence.Contains(p.Lng, p.Lat); got != tt.want {
			t.Errorf("%s: contains %v, want %v", tt.name, got, tt.want)
		}
	}

	inLane := at(200, 51)
	walls := fence.Walls(inLane.Lng, inLane.Lat)
	if len(walls) != 2 {
		t.Fatalf("in the lane: %d walls, want the 2 lane sides", len(walls))
	}
	for _, want := range []Point{at(200, 54), at(200, 46)} {
		if d := math.Min(metresApart(walls[0], want), metresApart(walls[1], want)); d > 0.2 {
			t.Errorf("no lane wall near %v (closest %.1f m)", want, d)
		}
	}

	nearGate := at(95, 50)
	for _, w := range fence.Walls(nearGate.Lng, nearGate.Lat) {
		if d := metresApart(w, at(100, 50)); d < 4 {
			t.Errorf("the gate opening at the old paddock edge was treated as a wall (%.1f m from the gate)", d)
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
		col.guide(target.Lng, target.Lat, 0)
		if col.guiding != s.want {
			t.Errorf("heading %v° off: guiding %v, want %v", s.offDeg, col.guiding, s.want)
		}
	}
}

func TestDriftStartsGuidanceEvenWhenHeadingIsFine(t *testing.T) {
	start := at(0, 0)
	target := at(0, 100)
	col := NewCollar("C", 1, "A", squareAt(-50, -50, 200), NewCow(start.Lng, start.Lat, rand.New(rand.NewSource(1))), warnM)

	steps := []struct {
		driftM float64
		want   bool
	}{
		{1.2, false},
		{2, true},
		{1.2, true},
		{0.5, false},
	}
	for _, s := range steps {
		col.cow.Heading = 0
		col.guide(target.Lng, target.Lat, s.driftM)
		if col.guiding != s.want {
			t.Errorf("drift %.1f m: guiding %v, want %v", s.driftM, col.guiding, s.want)
		}
	}
}

func TestLookaheadFollowsTheLaneRoundABend(t *testing.T) {
	s := NewShift("B", squareAt(0, 0, 100), squareAt(300, 200, 100), pathM([2]float64{50, 50}, [2]float64{200, 50}, [2]float64{200, 250}, [2]float64{350, 250}), 8, time.Time{})

	tests := []struct {
		name       string
		x, y       float64
		wantX      float64
		wantY      float64
		wantDriftM float64
	}{
		{"first leg, on the line", 150, 50, 155, 50, 0},
		{"first leg, drifted 2 m", 150, 52, 155, 50, 2},
		{"just before the bend", 198, 50, 200, 53, 0},
		{"second leg", 200, 150, 200, 155, 0},
	}
	for _, tt := range tests {
		p := at(tt.x, tt.y)
		lng, lat, drift := s.Guide(p.Lng, p.Lat)
		if d := metresApart(Point{Lng: lng, Lat: lat}, at(tt.wantX, tt.wantY)); d > 0.5 || math.Abs(drift-tt.wantDriftM) > 0.1 {
			t.Errorf("%s: target %.1f m off, drift %.1f m (want %.1f)", tt.name, d, drift, tt.wantDriftM)
		}
	}
}

func TestHerdFollowsAnLShapedLane(t *testing.T) {
	from, to := squareAt(0, 0, 100), squareAt(300, 200, 100)
	path := pathM([2]float64{50, 50}, [2]float64{200, 50}, [2]float64{200, 250}, [2]float64{350, 250})
	t0 := time.Unix(1_000, 0)
	shift := NewShift("B", from, to, path, 8, t0.Add(10*time.Second))
	const deadline = 1200

	var herd []*Collar
	arrived := map[int]int{}
	for seed := int64(1); seed <= 10; seed++ {
		rng := rand.New(rand.NewSource(seed))
		lng, lat := from.RandomPoint(rng)
		col := NewCollar("C", int(seed), "A", from, NewCow(lng, lat, rng), warnM)
		col.StartShift(shift)
		herd = append(herd, col)
	}

	for tick := 1; tick <= deadline+10 && len(arrived) < len(herd); tick++ {
		now := t0.Add(time.Duration(tick) * time.Second)
		for _, col := range herd {
			col.Step(now, 1)
			if col.State() == Breached {
				t.Fatalf("cow %d breached at tick %d", col.Number, tick)
			}
			if _, done := arrived[col.Number]; !done && col.shift == nil {
				arrived[col.Number] = tick - 10
			}
		}
	}

	for _, col := range herd {
		secs, ok := arrived[col.Number]
		if !ok {
			t.Errorf("cow %d did not arrive within %ds", col.Number, deadline)
			continue
		}
		t.Logf("cow %d arrived after %ds", col.Number, secs)
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
		b := paddock("B", squareAt(300, 0, 100))
		b.FenceVersion = 3
		return WorldFarm{
			FarmerID: "F",
			Paddocks: []WorldPaddock{paddock("A", squareAt(0, 0, 100)), b, paddock("C", squareAt(0, 300, 100))},
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
	if col.fenceVersion != 3 {
		t.Errorf("collar mid-move reports fence v%d, want the new paddock's v3", col.fenceVersion)
	}
	if r := tower.Reconcile(farm("B", shiftAB)); r != (ReconcileResult{}) {
		t.Errorf("repeat reconcile mid-shift changed things: %+v", r)
	}
	if r := tower.Reconcile(farm("C")); r.FenceChanged != 1 || col.shift != nil {
		t.Errorf("unplanned move: result %+v, shifting %v", r, col.shift != nil)
	}
}

func TestCowsWalkTheLaneWithFewCues(t *testing.T) {
	from, to := squareAt(0, 0, 100), squareAt(300, 200, 100)
	path := pathM([2]float64{50, 50}, [2]float64{200, 50}, [2]float64{200, 250}, [2]float64{350, 250})
	t0 := time.Unix(1_000, 0)
	shift := NewShift("B", from, to, path, 8, t0.Add(10*time.Second))
	total, laneSecs := 0, 0
	for seed := int64(1); seed <= 10; seed++ {
		rng := rand.New(rand.NewSource(seed))
		lng, lat := from.RandomPoint(rng)
		col := NewCollar("C", int(seed), "A", from, NewCow(lng, lat, rng), warnM)
		col.StartShift(shift)
		prev := CueNone
		for tick := 1; tick <= 1500 && col.shift != nil; tick++ {
			col.Step(t0.Add(time.Duration(tick)*time.Second), 1)
			inLane := !from.Contains(col.cow.Lng, col.cow.Lat) && !to.Contains(col.cow.Lng, col.cow.Lat)
			if inLane {
				laneSecs++
				if l := col.Level(); l != CueNone && prev == CueNone {
					total++
				}
			}
			prev = col.Level()
		}
	}
	if total*120 > laneSecs {
		t.Errorf("%d cues over %d cow-seconds in the lane, want at most one per 2 minutes per cow", total, laneSecs)
	}
}

func TestTurnBackMidLaneWalksTheHerdHome(t *testing.T) {
	a, b := squareAt(0, 0, 100), squareAt(300, 200, 100)
	lane := pathM([2]float64{50, 50}, [2]float64{200, 50}, [2]float64{200, 250}, [2]float64{350, 250})

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
	worldShift := func(from, to string, pts []Point, start time.Time) WorldShift {
		s := WorldShift{ID: from + to, FromPaddockID: from, ToPaddockID: to, StartAt: start, WidthM: 8}
		s.Path = &struct {
			Coordinates [][2]float64 `json:"coordinates"`
		}{}
		for _, p := range pts {
			s.Path.Coordinates = append(s.Path.Coordinates, [2]float64{p.Lng, p.Lat})
		}
		return s
	}
	farm := func(paddockID string, shifts ...WorldShift) WorldFarm {
		f := WorldFarm{FarmerID: "F", Paddocks: []WorldPaddock{paddock("A", a), paddock("B", b)}, Shifts: shifts}
		for i := 1; i <= 5; i++ {
			f.Collars = append(f.Collars, WorldCollar{ID: fmt.Sprintf("C%d", i), Number: i, PaddockID: &paddockID})
		}
		return f
	}
	reversed := make([]Point, len(lane))
	for i, p := range lane {
		reversed[len(lane)-1-i] = p
	}

	t0 := time.Unix(1_000, 0)
	tower := NewTower("F")
	tower.Reconcile(farm("A"))
	tower.Reconcile(farm("B", worldShift("A", "B", lane, t0)))

	now := t0
	tick := func() {
		now = now.Add(time.Second)
		tower.Tick(now, func(Event) {})
		for _, col := range tower.order {
			if col.State() == Breached {
				t.Fatalf("collar %s breached at %s", col.ID, now.Sub(t0))
			}
		}
	}
	inLane := func() int {
		n := 0
		for _, col := range tower.order {
			if !a.Contains(col.cow.Lng, col.cow.Lat) && !b.Contains(col.cow.Lng, col.cow.Lat) {
				n++
			}
		}
		return n
	}
	for i := 0; i < 600 && inLane() < 3; i++ {
		tick()
	}
	if inLane() < 3 {
		t.Fatalf("only %d cows reached the lane before turning back", inLane())
	}

	if r := tower.Reconcile(farm("A", worldShift("B", "A", reversed, now))); r.Shifted != 5 {
		t.Fatalf("turn back started %d shifts, want 5 (%+v)", r.Shifted, r)
	}

	home := func() bool {
		for _, col := range tower.order {
			if col.shift != nil || col.PaddockID != "A" || !a.Contains(col.cow.Lng, col.cow.Lat) {
				return false
			}
		}
		return true
	}
	for i := 0; i < 1200 && !home(); i++ {
		tick()
	}
	if !home() {
		t.Fatalf("herd not home in paddock A %s after turning back", now.Sub(t0))
	}
	t.Logf("herd home %s after the move started", now.Sub(t0))
}
