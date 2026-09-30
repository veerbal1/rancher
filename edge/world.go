package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
)

const (
	worldURL         = "https://3wht70bg87.execute-api.ap-south-1.amazonaws.com/world"
	worldRefresh     = 10 * time.Second
	emptyPayloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
)

type World struct {
	Farms []WorldFarm `json:"farms"`
}

type WorldFarm struct {
	FarmerID string `json:"farmer_id"`
	Name     string `json:"name"`
	Location struct {
		Lng float64 `json:"lng"`
		Lat float64 `json:"lat"`
	} `json:"location"`
	Paddocks []WorldPaddock `json:"paddocks"`
	Collars  []WorldCollar  `json:"collars"`
	Shifts   []WorldShift   `json:"shifts"`
}

type WorldPaddock struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Polygon struct {
		Coordinates [][][2]float64 `json:"coordinates"`
	} `json:"polygon"`
}

type WorldCollar struct {
	ID        string  `json:"id"`
	Number    int     `json:"number"`
	Name      string  `json:"name"`
	PaddockID *string `json:"paddock_id"`
}

type WorldShift struct {
	ID            string    `json:"id"`
	FromPaddockID string    `json:"from_paddock_id"`
	ToPaddockID   string    `json:"to_paddock_id"`
	StartAt       time.Time `json:"start_at"`
	Path          *struct {
		Coordinates [][2]float64 `json:"coordinates"`
	} `json:"path"`
	WidthM float64 `json:"width_m"`
}

func (s WorldShift) PathPoints() []Point {
	if s.Path == nil {
		return nil
	}
	pts := make([]Point, 0, len(s.Path.Coordinates))
	for _, c := range s.Path.Coordinates {
		pts = append(pts, Point{Lng: c[0], Lat: c[1]})
	}
	return pts
}

func fetchWorld(ctx context.Context, cfg aws.Config) (World, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, worldURL, nil)
	if err != nil {
		return World{}, err
	}
	creds, err := cfg.Credentials.Retrieve(ctx)
	if err != nil {
		return World{}, err
	}
	if err := v4.NewSigner().SignHTTP(ctx, creds, req, emptyPayloadHash, "execute-api", cfg.Region, time.Now()); err != nil {
		return World{}, err
	}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return World{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return World{}, fmt.Errorf("GET /world: %s", res.Status)
	}

	var w World
	err = json.NewDecoder(res.Body).Decode(&w)
	return w, err
}

func watchWorld(ctx context.Context, cfg aws.Config, updates chan<- World) {
	last, lastSummary := "", ""
	for {
		w, err := fetchWorld(ctx, cfg)
		if err != nil && ctx.Err() == nil {
			log.Printf("world: %v", err)
		} else if raw, _ := json.Marshal(w); err == nil && string(raw) != last {
			last = string(raw)
			if s := w.Summary(); s != lastSummary {
				log.Print(s)
				lastSummary = s
			}
			select {
			case updates <- w:
			case <-ctx.Done():
				return
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(worldRefresh):
		}
	}
}

func (w World) AssignedCollars() int {
	n := 0
	for _, f := range w.Farms {
		for _, c := range f.Collars {
			if c.PaddockID != nil {
				n++
			}
		}
	}
	return n
}

func (w World) Summary() string {
	var b strings.Builder
	fmt.Fprintf(&b, "world: %d farms", len(w.Farms))
	for _, f := range w.Farms {
		fmt.Fprintf(&b, "\n  %s (%.4f, %.4f)", f.Name, f.Location.Lat, f.Location.Lng)
		unassigned := len(f.Collars)
		for _, p := range f.Paddocks {
			var names []string
			for _, c := range f.Collars {
				if c.PaddockID != nil && *c.PaddockID == p.ID {
					names = append(names, c.Name)
				}
			}
			unassigned -= len(names)
			corners := 0
			if len(p.Polygon.Coordinates) > 0 {
				corners = len(p.Polygon.Coordinates[0]) - 1
			}
			fmt.Fprintf(&b, "\n    %s, %d corners: %d collars %v", p.Name, corners, len(names), names)
		}
		fmt.Fprintf(&b, "\n    unassigned collars: %d", unassigned)
	}
	return b.String()
}
