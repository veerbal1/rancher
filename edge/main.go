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
}

func main() {
	fence := Rect{MinX: 0, MinY: 0, MaxX: 100, MaxY: 100}

	sims := make([]*Sim, 0, numSims)
	for s := 0; s < numSims; s++ {
		sim := &Sim{ID: fmt.Sprintf("sim-%d", s+1)}
		for i := 0; i < numCows; i++ {
			id := fmt.Sprintf("cow-%d", i+1)
			c := NewCow(id, 80+float64(i)*5, 50, int64(s*numCows+i+1))
			sim.Collars = append(sim.Collars, NewCollar(c, fence, 10))
		}
		sims = append(sims, sim)
	}

	for tick := 1; ; tick++ {
		for _, sim := range sims {
			for _, col := range sim.Collars {
				col.Step(1)
			}
			fmt.Printf("%s tick %d:", sim.ID, tick)
			for _, col := range sim.Collars {
				fmt.Printf(" %s(%.1f,%.1f,%s:%s)", col.cow.ID, col.cow.X, col.cow.Y, col.State(), col.Level())
			}
			fmt.Println()
		}
		time.Sleep(time.Second)
	}
}
