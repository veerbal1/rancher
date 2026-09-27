package main

import (
	"fmt"
	"time"
)

const (
	numSims = 3
	numCows = 5
)

type Sim struct {
	ID      string
	Collars []*Collar
	seq     uint64
}

type Event struct {
	SimID string
	Seq   uint64
	Time  time.Time
	CowID string
	X     float64
	Y     float64
	State State
	Level Cue
}

func main() {
	fence := Rect{MinX: 0, MinY: 0, MaxX: 100, MaxY: 100}

	sims := make([]*Sim, 0, numSims)
	for s := 0; s < numSims; s++ {
		sim := &Sim{ID: fmt.Sprintf("sim-%d", s+1)}
		for i := 0; i < numCows; i++ {
			id := fmt.Sprintf("cow-%d", i+1)
			c := NewCow(id, 50+float64(i)*5, 50, int64(s*numCows+i+1))
			sim.Collars = append(sim.Collars, NewCollar(c, fence, 10))
		}
		sims = append(sims, sim)
	}

	events := make(chan Event, 100)
	go Tower(events)

	for {
		now := time.Now()
		for _, sim := range sims {
			for _, col := range sim.Collars {
				col.Step(1)
				sim.seq++
				events <- Event{
					SimID: sim.ID,
					Seq:   sim.seq,
					Time:  now,
					CowID: col.cow.ID,
					X:     col.cow.X,
					Y:     col.cow.Y,
					State: col.State(),
					Level: col.Level(),
				}
			}
		}
		time.Sleep(time.Second)
	}
}
