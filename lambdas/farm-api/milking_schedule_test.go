package main

import (
	"reflect"
	"testing"
	"time"
)

func TestDueSlots(t *testing.T) {
	ist, _ := time.LoadLocation("Asia/Kolkata")
	at := func(hh, mm int) time.Time { return time.Date(2026, 10, 5, hh, mm, 0, 0, ist).UTC() }
	sc := MilkingSchedule{Enabled: true, Timezone: "Asia/Kolkata", MorningAt: "17:00", EveningAt: "18:00", RestShedID: "R", ShedID: "S", PaddockID: "P"}
	off := sc
	off.Enabled = false
	badZone := sc
	badZone.Timezone = "Mars/Olympus"

	tests := []struct {
		name string
		sc   MilkingSchedule
		now  time.Time
		want []dueSlot
	}{
		{"just before morning", sc, at(16, 59), nil},
		{"morning: rest shed to paddock", sc, at(17, 5), []dueSlot{{"morning", "2026-10-05-morning-1700", "R", "P"}}},
		{"morning window has closed", sc, at(17, 15), nil},
		{"evening: paddock to rest shed", sc, at(18, 0), []dueSlot{{"evening", "2026-10-05-evening-1800", "P", "R"}}},
		{"switched off", off, at(17, 5), nil},
		{"unknown timezone", badZone, at(17, 5), nil},
	}
	for _, tt := range tests {
		if got := dueSlots(tt.sc, tt.now); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("%s: got %v, want %v", tt.name, got, tt.want)
		}
	}
}

func TestMovingASlotMakesANewSession(t *testing.T) {
	ist, _ := time.LoadLocation("Asia/Kolkata")
	sc := MilkingSchedule{Enabled: true, Timezone: "Asia/Kolkata", MorningAt: "05:00", EveningAt: "22:56", RestShedID: "R", ShedID: "S", PaddockID: "P"}
	first := dueSlots(sc, time.Date(2026, 10, 4, 22, 57, 0, 0, ist))
	sc.EveningAt = "23:36"
	again := dueSlots(sc, time.Date(2026, 10, 4, 23, 37, 0, 0, ist))
	if len(first) != 1 || len(again) != 1 || first[0].sessionID == again[0].sessionID {
		t.Fatalf("moving the evening slot on the same day should start a new session: %v then %v", first, again)
	}
}
