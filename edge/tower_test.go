package main

import (
	"fmt"
	"testing"
	"time"
)

func TestReconcileSequence(t *testing.T) {
	paddockA := worldPaddock("A", square(100))
	paddockB := worldPaddock("B", polygonM([2]float64{200, 0}, [2]float64{300, 0}, [2]float64{300, 100}, [2]float64{200, 100}))
	tower := NewTower("F1")

	check := func(step string, got, want ReconcileResult, cows int) {
		t.Helper()
		if got != want {
			t.Errorf("%s: result %+v, want %+v", step, got, want)
		}
		if len(tower.order) != cows {
			t.Errorf("%s: %d cows, want %d", step, len(tower.order), cows)
		}
	}

	world := farm([]WorldPaddock{paddockA, paddockB},
		worldCollar("c1", 1, "A"), worldCollar("c2", 2, "A"), worldCollar("c3", 3, "A"), worldCollar("c4", 4, ""))
	check("assign 3", tower.Reconcile(world), ReconcileResult{Added: 3}, 3)
	if _, ok := tower.collars["c4"]; ok {
		t.Error("unassigned collar c4 got a cow")
	}
	for _, col := range tower.order {
		if !square(100).Contains(col.cow.Lng, col.cow.Lat) {
			t.Errorf("cow for %s spawned outside paddock A", col.ID)
		}
	}

	check("same world again", tower.Reconcile(world), ReconcileResult{}, 3)

	cow2 := *tower.collars["c2"].cow
	world = farm([]WorldPaddock{paddockA, paddockB},
		worldCollar("c1", 1, "A"), worldCollar("c2", 2, "B"), worldCollar("c3", 3, "A"), worldCollar("c4", 4, ""))
	check("move c2 to B", tower.Reconcile(world), ReconcileResult{FenceChanged: 1}, 3)
	if moved := tower.collars["c2"]; moved.PaddockID != "B" || moved.cow.Lng != cow2.Lng || moved.cow.Lat != cow2.Lat {
		t.Errorf("c2 after move: paddock %s at (%v, %v); want paddock B and the same position", moved.PaddockID, moved.cow.Lat, moved.cow.Lng)
	}

	world.Paddocks = []WorldPaddock{worldPaddock("A", square(120)), paddockB}
	check("redraw A", tower.Reconcile(world), ReconcileResult{FenceQueued: 2}, 3)

	world.Collars = []WorldCollar{worldCollar("c1", 1, "A"), worldCollar("c2", 2, "B"), worldCollar("c3", 3, ""), worldCollar("c4", 4, "")}
	check("unassign c3", tower.Reconcile(world), ReconcileResult{Removed: 1}, 2)

	world.Paddocks = []WorldPaddock{worldPaddock("A", square(120))}
	check("delete B, c2 still points at it", tower.Reconcile(world), ReconcileResult{Removed: 1}, 1)
	if _, ok := tower.collars["c1"]; !ok {
		t.Error("c1 should still have a cow")
	}
}

func TestTickEvents(t *testing.T) {
	tower := NewTower("F1")
	tower.Reconcile(farm([]WorldPaddock{worldPaddock("A", square(100))},
		worldCollar("x", 3, "A"), worldCollar("y", 1, "A"), worldCollar("z", 2, "A")))

	var events []Event
	emit := func(e Event) { events = append(events, e) }
	t1 := time.Date(2026, 9, 29, 10, 0, 0, 0, time.UTC)
	t2 := t1.Add(time.Second)
	tower.Tick(t1, emit)
	tower.Tick(t2, emit)

	if len(events) != 6 {
		t.Fatalf("got %d events, want 6", len(events))
	}
	wantOrder := []string{"y", "z", "x", "y", "z", "x"}
	for i, e := range events {
		if e.Seq != uint64(i+1) {
			t.Errorf("event %d: seq %d, want %d", i, e.Seq, i+1)
		}
		if e.CollarID != wantOrder[i] {
			t.Errorf("event %d: collar %s, want %s", i, e.CollarID, wantOrder[i])
		}
		if e.FarmerID != "F1" || e.PaddockID != "A" {
			t.Errorf("event %d: farmer %s paddock %s, want F1 and A", i, e.FarmerID, e.PaddockID)
		}
		if wantTime := map[bool]time.Time{true: t1, false: t2}[i < 3]; !e.Time.Equal(wantTime) {
			t.Errorf("event %d: time %v, want %v", i, e.Time, wantTime)
		}
	}
	last := tower.collars["x"].cow
	if got := events[5]; got.Lat != last.Lat || got.Lng != last.Lng {
		t.Errorf("last event at (%v, %v), cow at (%v, %v)", got.Lat, got.Lng, last.Lat, last.Lng)
	}
}

func TestSpawnIsDeterministic(t *testing.T) {
	world := farm([]WorldPaddock{worldPaddock("A", square(100))}, worldCollar("c1", 1, "A"))
	a, b := NewTower("F1"), NewTower("F1")
	a.Reconcile(world)
	b.Reconcile(world)
	if ca, cb := a.collars["c1"].cow, b.collars["c1"].cow; ca.Lat != cb.Lat || ca.Lng != cb.Lng {
		t.Errorf("same collar spawned at (%v, %v) and (%v, %v)", ca.Lat, ca.Lng, cb.Lat, cb.Lng)
	}
}

func TestFenceUpdateReachesEveryCollarDespiteLoss(t *testing.T) {
	v1 := worldPaddock("A", square(100))
	v1.FenceVersion = 1
	v2 := worldPaddock("A", square(120))
	v2.FenceVersion = 2

	var collars []WorldCollar
	for i := 1; i <= 20; i++ {
		collars = append(collars, worldCollar(fmt.Sprintf("c%d", i), i, "A"))
	}
	tower := NewTower("F1")
	tower.Reconcile(farm([]WorldPaddock{v1}, collars...))

	if r := tower.Reconcile(farm([]WorldPaddock{v2}, collars...)); r.FenceQueued != 20 {
		t.Fatalf("edit queued %d updates, want 20 (%+v)", r.FenceQueued, r)
	}
	if r := tower.Reconcile(farm([]WorldPaddock{v2}, collars...)); r != (ReconcileResult{}) {
		t.Errorf("re-reading the same world queued again: %+v", r)
	}

	updated := func() int {
		n := 0
		for _, col := range tower.order {
			if col.fenceVersion == 2 {
				n++
			}
		}
		return n
	}
	now := time.Unix(1_000, 0)
	var afterFirst, ticks int
	for ticks = 1; ticks <= 30 && updated() < 20; ticks++ {
		now = now.Add(time.Second)
		tower.Tick(now, func(Event) {})
		if ticks == 1 {
			afterFirst = updated()
		}
	}

	if afterFirst == 0 || afterFirst == 20 {
		t.Errorf("after one tick %d/20 collars updated, want some but not all (lossy radio)", afterFirst)
	}
	if updated() != 20 {
		t.Fatalf("only %d/20 collars updated after %d ticks", updated(), ticks)
	}
	for _, col := range tower.order {
		if !sameFence(col.fence, square(120)) {
			t.Errorf("%s reports version 2 but still has the old boundary", col.ID)
		}
	}
	t.Logf("%d/20 after the first tick, all 20 after %d ticks", afterFirst, ticks-1)
}
