package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sort"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/kinesis"
)

const sendToKinesis = true

type Event struct {
	FarmerID  string    `json:"farmer_id"`
	Seq       uint64    `json:"seq"`
	Time      time.Time `json:"time"`
	CollarID  string    `json:"collar_id"`
	PaddockID string    `json:"paddock_id"`
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	State     State     `json:"state"`
	Level     Cue       `json:"level"`
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("aws config: %v", err)
	}

	updates := make(chan World, 1)
	go watchWorld(ctx, cfg, updates)
	towers := map[string]*Tower{}

	events := make(chan Event, 100)
	done := make(chan struct{})
	go func() {
		if sendToKinesis {
			Uplink(events, kinesis.NewFromConfig(cfg))
		} else {
			logEvents(events)
		}
		close(done)
	}()

	for ctx.Err() == nil {
		select {
		case w := <-updates:
			applyWorld(towers, w)
		default:
		}

		now := time.Now()
		for _, t := range sortedTowers(towers) {
			t.Tick(now, func(e Event) { events <- e })
		}

		select {
		case <-ctx.Done():
		case <-time.After(time.Second):
		}
	}

	close(events)
	<-done
	fmt.Println("shutdown: all events drained")
}

func applyWorld(towers map[string]*Tower, w World) {
	seen := make(map[string]bool, len(w.Farms))
	for _, f := range w.Farms {
		seen[f.FarmerID] = true
		t, ok := towers[f.FarmerID]
		if !ok {
			t = NewTower(f.FarmerID)
			towers[f.FarmerID] = t
			log.Printf("tower %s: up", f.Name)
		}
		if r := t.Reconcile(f); r != (ReconcileResult{}) {
			log.Printf("tower %s: +%d cows, %d fences changed, -%d cows, %d cows now", t.Name, r.Added, r.FenceChanged, r.Removed, len(t.order))
		}
	}
	for id, t := range towers {
		if !seen[id] {
			delete(towers, id)
			log.Printf("tower %s: down", t.Name)
		}
	}
}

func sortedTowers(towers map[string]*Tower) []*Tower {
	list := make([]*Tower, 0, len(towers))
	for _, t := range towers {
		list = append(list, t)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].FarmerID < list[j].FarmerID })
	return list
}

func logEvents(events <-chan Event) {
	for e := range events {
		log.Printf("event farmer=%s seq=%d collar=%s (%.6f, %.6f) %s/%s", short(e.FarmerID), e.Seq, short(e.CollarID), e.Lat, e.Lng, e.State, e.Level)
	}
}

func short(id string) string {
	if len(id) > 6 {
		return id[:6]
	}
	return id
}
