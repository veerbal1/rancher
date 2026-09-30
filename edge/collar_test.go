package main

import (
	"math"
	"math/rand"
	"slices"
	"testing"
	"time"
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
			col.Step(time.Now(), 1)
			if col.State() == Breached {
				t.Fatalf("seed %d: breached at tick %d", seed, tick)
			}
		}
	}
}

func TestDirectionalCues(t *testing.T) {
	deg := func(d float64) float64 { return d * math.Pi / 180 }
	tests := []struct {
		name    string
		x, y    float64
		heading float64
		want    []Side
	}{
		{"east wall on her right", 96, 50, 30, []Side{SideRight}},
		{"west wall on her left", 4, 50, -30, []Side{SideLeft}},
		{"facing into the north-east corner", 94, 94, 45, []Side{SideBoth}},
		{"walking along the east fence", 97, 50, 0, []Side{SideNone}},
		{"walking away from the east fence", 95, 50, 270, []Side{SideNone}},
		{"exactly head-on to the north fence", 50, 95, 0, []Side{SideLeft, SideRight}},
	}
	for _, tt := range tests {
		p := at(tt.x, tt.y)
		cow := NewCow(p.Lng, p.Lat, rand.New(rand.NewSource(1)))
		cow.Heading = wrap(deg(tt.heading))
		col := NewCollar("C", 1, "A", square(100), cow, 10)

		_, got := col.assess()
		if !slices.Contains(tt.want, got) {
			t.Errorf("%s: side %v, want one of %v", tt.name, got, tt.want)
		}
	}
}

func TestRightEmitterTurnsHerLeftAwayFromTheWall(t *testing.T) {
	p := at(95, 50)
	cow := NewCow(p.Lng, p.Lat, rand.New(rand.NewSource(1)))
	cow.Heading = 30 * math.Pi / 180
	cow.Wander = 0
	col := NewCollar("C", 1, "A", square(100), cow, 10)

	col.Step(time.Now(), 1)
	if col.Side() != SideRight {
		t.Fatalf("side %v, want right", col.Side())
	}
	if cow.Heading > 30*math.Pi/180 && cow.Heading < math.Pi {
		t.Errorf("heading %.0f°, want a turn to the left from 30°", cow.Heading*180/math.Pi)
	}
}

func TestGuidanceFiresTheSideAwayFromTheTarget(t *testing.T) {
	start := at(0, 0)
	col := NewCollar("C", 1, "A", squareAt(-50, -50, 200), NewCow(start.Lng, start.Lat, rand.New(rand.NewSource(1))), warnM)
	col.cow.Heading = 0

	cases := []struct {
		name   string
		target Point
		want   Side
	}{
		{"target on her left", at(-100, 5), SideRight},
		{"target on her right", at(100, 5), SideLeft},
		{"target behind her", at(0, -100), SideBoth},
	}
	for _, c := range cases {
		col.guiding = false
		col.guide(c.target.Lng, c.target.Lat, 0)
		if !col.guiding || col.guideSide != c.want {
			t.Errorf("%s: guiding %v side %v, want %v", c.name, col.guiding, col.guideSide, c.want)
		}
	}
}

func TestCuedCowTurnsAndWalksAway(t *testing.T) {
	const cows = 100
	totalSecs, closest := 0, math.Inf(1)
	for seed := int64(1); seed <= cows; seed++ {
		rng := rand.New(rand.NewSource(seed))
		p := at(92, 50)
		cow := NewCow(p.Lng, p.Lat, rng)
		cow.Heading = (60 + rng.Float64()*60) * math.Pi / 180
		col := NewCollar("C", 1, "A", square(100), cow, 10)

		cuedAt := -1
		for tick := 1; tick <= 60; tick++ {
			col.Step(time.Now(), 1)
			fromWall := 100 - (col.cow.Lng-originLng)*metresPerDeg*math.Cos(originLat*math.Pi/180)
			closest = math.Min(closest, fromWall)
			if cuedAt < 0 && col.Side() != SideNone {
				cuedAt = tick
			}
			if cuedAt >= 0 && (fromWall > 15 || tick == 60) {
				totalSecs += tick - cuedAt
				break
			}
		}
	}
	if avg := float64(totalSecs) / cows; avg > 20 {
		t.Errorf("cued cows took %.1fs on average to get 15 m clear of the fence, want under 20s", avg)
	}
	if closest < 2 {
		t.Errorf("a cued cow came within %.1f m of the fence, want at least 2 m", closest)
	}
}
