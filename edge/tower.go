package main

import (
	"hash/fnv"
	"math"
	"math/rand"
	"slices"
	"sort"
	"time"
)

const (
	warnM        = 10.0
	deliveryRate = 0.8
)

type fenceUpdate struct {
	fence   Polygon
	version int
}

type Tower struct {
	FarmerID string
	Name     string
	seq      uint64
	collars  map[string]*Collar
	order    []*Collar
	pending  map[string]fenceUpdate
	rng      *rand.Rand
}

type ReconcileResult struct {
	Added        int
	FenceChanged int
	FenceQueued  int
	Shifted      int
	Removed      int
}

func NewTower(farmerID string) *Tower {
	return &Tower{
		FarmerID: farmerID,
		collars:  map[string]*Collar{},
		pending:  map[string]fenceUpdate{},
		rng:      rand.New(rand.NewSource(seedFor(farmerID))),
	}
}

func (t *Tower) Reconcile(f WorldFarm) ReconcileResult {
	t.Name = f.Name

	fences := make(map[string]Polygon, len(f.Paddocks))
	versions := make(map[string]int, len(f.Paddocks))
	for _, p := range f.Paddocks {
		if len(p.Polygon.Coordinates) == 0 {
			continue
		}
		if fence := PolygonFromRing(p.Polygon.Coordinates[0]); len(fence) >= 3 {
			fences[p.ID] = fence
			versions[p.ID] = p.FenceVersion
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
		version := versions[*c.PaddockID]

		col, exists := t.collars[c.ID]
		switch {
		case !exists:
			rng := rand.New(rand.NewSource(seedFor(c.ID)))
			lng, lat := fence.RandomPoint(rng)
			col = NewCollar(c.ID, c.Number, *c.PaddockID, fence, NewCow(lng, lat, rng), warnM)
			col.fenceVersion = version
			t.collars[c.ID] = col
			r.Added++
		case col.shift != nil && col.shift.ToID == *c.PaddockID:
		case col.PaddockID != *c.PaddockID:
			delete(t.pending, c.ID)
			if s, from := findShift(f.Shifts, col.PaddockID, *c.PaddockID), fences[col.PaddockID]; s != nil && from != nil {
				shift := NewShift(s.ToPaddockID, from, fence, s.PathPoints(), s.WidthM, s.StartAt)
				shift.ToVersion = version
				col.StartShift(shift)
				r.Shifted++
			} else {
				col.SetFence(*c.PaddockID, fence)
				col.fenceVersion = version
				r.FenceChanged++
			}
		case !sameFence(col.fence, fence) || col.fenceVersion != version:
			if u, queued := t.pending[c.ID]; !queued || u.version != version || !slices.Equal(u.fence, fence) {
				t.pending[c.ID] = fenceUpdate{fence: fence, version: version}
				r.FenceQueued++
			}
		}
	}

	for id := range t.collars {
		if !wanted[id] {
			delete(t.collars, id)
			delete(t.pending, id)
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
		if u, queued := t.pending[col.ID]; queued && t.rng.Float64() < deliveryRate {
			col.SetFence(col.PaddockID, u.fence)
			col.fenceVersion = u.version
			delete(t.pending, col.ID)
		}
	}

	for _, col := range t.order {
		col.Step(now, 1)
		t.seq++
		emit(Event{
			FarmerID:     t.FarmerID,
			Seq:          t.seq,
			Time:         now,
			CollarID:     col.ID,
			PaddockID:    col.PaddockID,
			Lat:          col.cow.Lat,
			Lng:          col.cow.Lng,
			Heading:      col.cow.Heading * 180 / math.Pi,
			State:        col.State(),
			Level:        col.Level(),
			Side:         col.Side(),
			FenceVersion: col.fenceVersion,
		})
	}
}

func sameFence(f Fence, p Polygon) bool {
	current, ok := f.(Polygon)
	return ok && slices.Equal(current, p)
}

func findShift(shifts []WorldShift, from, to string) *WorldShift {
	for i := range shifts {
		if shifts[i].FromPaddockID == from && shifts[i].ToPaddockID == to {
			return &shifts[i]
		}
	}
	return nil
}

func seedFor(id string) int64 {
	h := fnv.New64a()
	h.Write([]byte(id))
	return int64(h.Sum64() >> 1)
}
