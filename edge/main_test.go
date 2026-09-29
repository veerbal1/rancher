package main

import "testing"

func TestApplyWorldTowersUpAndDown(t *testing.T) {
	farms := func(ids ...string) World {
		w := World{}
		for _, id := range ids {
			w.Farms = append(w.Farms, WorldFarm{FarmerID: id, Name: id})
		}
		return w
	}

	towers := map[string]*Tower{}
	applyWorld(towers, farms("F1", "F2", "F3"))
	if len(towers) != 3 {
		t.Fatalf("got %d towers, want 3", len(towers))
	}

	f1 := towers["F1"]
	f1.seq = 42

	applyWorld(towers, farms("F1", "F3"))
	if _, ok := towers["F2"]; ok || len(towers) != 2 {
		t.Errorf("F2 should be down; towers = %v", keys(towers))
	}

	applyWorld(towers, farms("F1", "F3", "F4"))
	if towers["F4"] == nil || towers["F4"].seq != 0 {
		t.Errorf("F4 should be up with seq 0")
	}
	if towers["F1"] != f1 || towers["F1"].seq != 42 {
		t.Errorf("F1 should be the same tower and keep its seq")
	}
}

func keys(m map[string]*Tower) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
