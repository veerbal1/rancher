package main

import (
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
