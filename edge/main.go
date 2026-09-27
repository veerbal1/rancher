package main

import (
	"fmt"
	"time"
)

func main() {
	fence := Rect{MinX: 0, MinY: 0, MaxX: 100, MaxY: 100}

	collars := make([]*Collar, 0, 5)
	for i := 0; i < 5; i++ {
		id := fmt.Sprintf("cow-%d", i+1)
		c := NewCow(id, 50+float64(i)*3, 50, int64(i+1))
		collars = append(collars, NewCollar(c, fence, 10))
	}

	for tick := 1; ; tick++ {
		for _, col := range collars {
			col.Step(1)
		}
		fmt.Printf("tick %d:", tick)
		for _, col := range collars {
			fmt.Printf(" %s(%.1f,%.1f,%s)", col.cow.ID, col.cow.X, col.cow.Y, col.Zone())
		}
		fmt.Println()
		time.Sleep(time.Second)
	}
}
