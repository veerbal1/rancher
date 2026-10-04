package main

import (
	"testing"
	"time"
)

func TestShiftRunningUntilItsCowsStopMoving(t *testing.T) {
	start := time.Date(2026, 9, 30, 5, 0, 0, 0, time.UTC)
	s := Shift{
		CollarIDs: []string{"C1", "C2"},
		StartAt:   start.Format(time.RFC3339),
		ExpiresAt: start.Add(10 * time.Minute).Format(time.RFC3339),
	}

	tests := []struct {
		name   string
		now    time.Time
		moving map[string]bool
		want   bool
	}{
		{"just started, sim not caught up", start.Add(10 * time.Second), nil, true},
		{"cows still walking", start.Add(3 * time.Minute), map[string]bool{"C2": true}, true},
		{"cows arrived before expiry", start.Add(3 * time.Minute), map[string]bool{"C9": true}, false},
		{"expired even if a reading says moving", start.Add(11 * time.Minute), map[string]bool{"C1": true}, false},
	}
	for _, tt := range tests {
		if got := s.running(tt.now, tt.moving); got != tt.want {
			t.Errorf("%s: running %v, want %v", tt.name, got, tt.want)
		}
	}
}

func TestMoveIsBlockedOnlyByItsOwnCows(t *testing.T) {
	start := time.Date(2026, 10, 5, 5, 0, 0, 0, time.UTC)
	walking := Shift{
		FromPaddockID: "A",
		ToPaddockID:   "Shed",
		CollarIDs:     []string{"C1"},
		StartAt:       start.Format(time.RFC3339),
		ExpiresAt:     start.Add(10 * time.Minute).Format(time.RFC3339),
	}
	now := start.Add(time.Minute)

	tests := []struct {
		name    string
		collars []string
		moving  map[string]bool
		want    int
	}{
		{"next cow out of the same paddock", []string{"C2"}, map[string]bool{"C1": true}, 0},
		{"the cow still walking", []string{"C1"}, map[string]bool{"C1": true}, 1},
		{"a herd that includes her", []string{"C1", "C2", "C3"}, map[string]bool{"C1": true}, 1},
		{"she has arrived", []string{"C1"}, nil, 0},
	}
	for _, tt := range tests {
		if got := busyCollars([]Shift{walking}, tt.collars, now, tt.moving); got != tt.want {
			t.Errorf("%s: %d busy cows, want %d", tt.name, got, tt.want)
		}
	}
}
