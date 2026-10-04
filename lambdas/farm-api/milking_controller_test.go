package main

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestDecideMilking(t *testing.T) {
	now := time.Date(2026, 10, 5, 5, 0, 0, 0, time.UTC)
	ago := func(d time.Duration) string { return now.Add(-d).Format(time.RFC3339) }
	shed := [][]float64{{0, 0}, {1, 0}, {1, 1}, {0, 1}, {0, 0}}
	inShed := cowReading{Lng: 0.5, Lat: 0.5, State: "inside", At: now}
	inField := cowReading{Lng: 5, Lat: 5, State: "inside", At: now}
	walking := cowReading{Lng: 5, Lat: 5, State: "moving", At: now}

	session := func(capacity int, cows ...SessionCow) MilkingSession {
		return MilkingSession{FromPaddockID: "F", ShedID: "S", ToPaddockID: "T", Capacity: capacity, MilkingSecs: 120, Cows: cows}
	}
	cow := func(id, status, stamp string) SessionCow {
		c := SessionCow{CollarID: id, Status: status}
		switch status {
		case cowCalled:
			c.CalledAt = stamp
		case cowMilking:
			c.MilkingFrom = stamp
		}
		return c
	}

	tests := []struct {
		name     string
		session  MilkingSession
		collars  map[string]string
		readings map[string]cowReading
		want     []string
	}{
		{
			"fills the shed in collar order",
			session(2, cow("C1", cowWaiting, ""), cow("C2", cowWaiting, ""), cow("C3", cowWaiting, "")),
			map[string]string{"C1": "F", "C2": "F", "C3": "F"},
			map[string]cowReading{"C1": inField, "C2": inField, "C3": inField},
			[]string{"call C1", "call C2"},
		},
		{
			"a cow still on another move waits her turn",
			session(1, cow("C1", cowWaiting, ""), cow("C2", cowWaiting, "")),
			map[string]string{"C1": "F", "C2": "F"},
			map[string]cowReading{"C1": walking, "C2": inField},
			[]string{"call C2"},
		},
		{
			"a called cow inside the shed starts milking and keeps her spot",
			session(1, cow("C1", cowCalled, ago(time.Minute)), cow("C2", cowWaiting, "")),
			map[string]string{"C1": "S", "C2": "F"},
			map[string]cowReading{"C1": inShed, "C2": inField},
			[]string{"arrive C1"},
		},
		{
			"a milked cow moves on and the next cow takes her spot",
			session(1, cow("C1", cowMilking, ago(3*time.Minute)), cow("C2", cowWaiting, "")),
			map[string]string{"C1": "S", "C2": "F"},
			map[string]cowReading{"C1": inShed, "C2": inField},
			[]string{"finish C1 move", "call C2"},
		},
		{
			"a cow still milking keeps her spot",
			session(1, cow("C1", cowMilking, ago(time.Minute)), cow("C2", cowWaiting, "")),
			map[string]string{"C1": "S", "C2": "F"},
			map[string]cowReading{"C1": inShed, "C2": inField},
			nil,
		},
		{
			"a called cow who never arrives is missed and frees her spot",
			session(1, cow("C1", cowCalled, ago(16*time.Minute)), cow("C2", cowWaiting, "")),
			map[string]string{"C1": "S", "C2": "F"},
			map[string]cowReading{"C1": inField, "C2": inField},
			[]string{"miss C1", "call C2"},
		},
		{
			"a waiting cow moved away by hand is missed",
			session(2, cow("C1", cowWaiting, "")),
			map[string]string{"C1": "X"},
			map[string]cowReading{"C1": inField},
			[]string{"miss C1"},
		},
		{
			"a cow with no recent reading is not called",
			session(2, cow("C1", cowWaiting, "")),
			map[string]string{"C1": "F"},
			map[string]cowReading{"C1": {Lng: 5, Lat: 5, State: "inside", At: now.Add(-time.Minute)}},
			nil,
		},
		{
			"ends when every cow is done or missed",
			session(2, cow("C1", cowDone, ""), cow("C2", cowMissed, "")),
			nil,
			nil,
			[]string{"end"},
		},
	}
	for _, tt := range tests {
		var got []string
		for _, a := range decideMilking(tt.session, tt.collars, tt.readings, shed, now) {
			s := a.Kind + " " + a.CollarID
			if a.Move {
				s += " move"
			}
			got = append(got, strings.TrimSpace(s))
		}
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("%s: got %v, want %v", tt.name, got, tt.want)
		}
	}
}
