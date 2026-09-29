package main

import (
	"hash/fnv"
	"math"
	"math/rand"
	"slices"
	"sort"
	"time"
)

const warnM = 10.0

type Tower struct {
	FarmerID string
	Name     string
	seq      uint64
	collars  map[string]*Collar
	order    []*Collar
}

type ReconcileResult struct {
	Added        int
	FenceChanged int
	Removed      int
}

func NewTower(farmerID string) *Tower {
	return &Tower{FarmerID: farmerID, collars: map[string]*Collar{}}
}

func (t *Tower) Reconcile(f WorldFarm) ReconcileResult {
	t.Name = f.Name

	fences := make(map[string]Polygon, len(f.Paddocks))
	for _, p := range f.Paddocks {
		if len(p.Polygon.Coordinates) == 0 {
			continue
		}
		if fence := PolygonFromRing(p.Polygon.Coordinates[0]); len(fence) >= 3 {
			fences[p.ID] = fence
		}
	}

	var r ReconcileResult
	wanted := make(map[string]bool, len(f.Collars))
	for _, c := range f.Collars {
		if c.PaddockID == nil {
			continue
		}
		fence, ok := fences[*c.PaddockID]
		if !ok {
			continue
		}
		wanted[c.ID] = true

		col, exists := t.collars[c.ID]
		switch {
		case !exists:
			rng := rand.New(rand.NewSource(seedFor(c.ID)))
			lng, lat := fence.RandomPoint(rng)
			t.collars[c.ID] = NewCollar(c.ID, c.Number, *c.PaddockID, fence, NewCow(lng, lat, rng), warnM)
			r.Added++
		case col.PaddockID != *c.PaddockID || !slices.Equal(col.fence, fence):
			col.SetFence(*c.PaddockID, fence)
			r.FenceChanged++
		}
	}

	for id := range t.collars {
		if !wanted[id] {
			delete(t.collars, id)
			r.Removed++
		}
	}

	t.order = t.order[:0]
	for _, col := range t.collars {
		t.order = append(t.order, col)
	}
	sort.Slice(t.order, func(i, j int) bool { return t.order[i].Number < t.order[j].Number })
	return r
}

func (t *Tower) Tick(now time.Time, emit func(Event)) {
	for _, col := range t.order {
		col.Step(1)
		t.seq++
		emit(Event{
			FarmerID:  t.FarmerID,
			Seq:       t.seq,
			Time:      now,
			CollarID:  col.ID,
			PaddockID: col.PaddockID,
			Lat:       col.cow.Lat,
			Lng:       col.cow.Lng,
			Heading:   col.cow.Heading * 180 / math.Pi,
			State:     col.State(),
			Level:     col.Level(),
		})
	}
}

func seedFor(id string) int64 {
	h := fnv.New64a()
	h.Write([]byte(id))
	return int64(h.Sum64() >> 1)
}
