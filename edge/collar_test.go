package main

import (
	"math"
	"math/rand"
	"testing"
)

func TestCueLadderAndCalmDown(t *testing.T) {
	fence := square(100)
	outside := at(-20, 50)
	cow := NewCow(outside.Lng, outside.Lat, rand.New(rand.NewSource(1)))
	col := NewCollar("C1", 1, "A", fence, cow, 10)

	cues := map[int]Cue{}
	for tick := 1; tick <= 30; tick++ {
		if cue := col.Observe(); cue != CueNone {
			cues[tick] = cue
		}
	}

	want := map[int]Cue{1: CueAudio, 9: CueVibration, 17: CuePulse}
	if len(cues) != len(want) {
		t.Fatalf("cues = %v, want %v", cues, want)
	}
	for tick, cue := range want {
		if cues[tick] != cue {
			t.Errorf("tick %d: cue %v, want %v", tick, cues[tick], cue)
		}
	}
	if col.State() != Breached || col.Level() != CueNone || !col.gaveUp {
		t.Errorf("after the ladder: state %v, level %v, gaveUp %v; want breached, none, true", col.State(), col.Level(), col.gaveUp)
	}

	centre := at(50, 50)
	cow.Lng, cow.Lat = centre.Lng, centre.Lat
	for tick := 1; tick <= calmAfter; tick++ {
		col.Observe()
		if tick < calmAfter && col.State() != Breached {
			t.Fatalf("calm tick %d: state %v, want still breached", tick, col.State())
		}
	}
	if col.State() != Inside || col.Level() != CueNone || col.gaveUp {
		t.Errorf("after calming down: state %v, level %v, gaveUp %v; want inside, none, false", col.State(), col.Level(), col.gaveUp)
	}
}

func TestCuedCowNeverBreaches(t *testing.T) {
	fence := square(100)
	for seed := int64(1); seed <= 20; seed++ {
		start := at(95, 50)
		cow := NewCow(start.Lng, start.Lat, rand.New(rand.NewSource(seed)))
		cow.Heading = math.Pi / 2
		col := NewCollar("C1", 1, "A", fence, cow, 10)

		for tick := 1; tick <= 600; tick++ {
			col.Step(1)
			if col.State() == Breached {
				t.Fatalf("seed %d: breached at tick %d", seed, tick)
			}
		}
	}
}
