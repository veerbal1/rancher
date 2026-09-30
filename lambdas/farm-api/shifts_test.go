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
