package main

import (
	"container/heap"
	"context"
	"fmt"
	"math"
	"sort"
)

const (
	metresPerDegree = 111_320.0
	onRoadM         = 0.5
	gateReachM      = 1.0
)

type routeNode struct {
	pt    []float64
	edges []routeEdge
}

type routeEdge struct {
	to     string
	m      float64
	widthM float64
}

type routeGraph struct {
	nodes map[string]*routeNode
	k     float64
}

func nodeKey(pt []float64) string { return fmt.Sprintf("%.7f,%.7f", pt[0], pt[1]) }

func (g *routeGraph) xy(pt []float64) (float64, float64) {
	return pt[0] * g.k, pt[1] * metresPerDegree
}

func (g *routeGraph) dist(a, b []float64) float64 {
	ax, ay := g.xy(a)
	bx, by := g.xy(b)
	return math.Hypot(bx-ax, by-ay)
}

func (g *routeGraph) project(p, a, b []float64) (t, d float64) {
	px, py := g.xy(p)
	ax, ay := g.xy(a)
	bx, by := g.xy(b)
	dx, dy := bx-ax, by-ay
	if l := dx*dx + dy*dy; l > 0 {
		t = math.Max(0, math.Min(1, ((px-ax)*dx+(py-ay)*dy)/l))
	}
	return t, math.Hypot(ax+t*dx-px, ay+t*dy-py)
}

func (g *routeGraph) node(pt []float64) string {
	key := nodeKey(pt)
	if g.nodes[key] == nil {
		g.nodes[key] = &routeNode{pt: pt}
	}
	return key
}

func (g *routeGraph) link(a, b []float64, widthM float64) {
	ka, kb := g.node(a), g.node(b)
	if ka == kb {
		return
	}
	m := g.dist(a, b)
	g.nodes[ka].edges = append(g.nodes[ka].edges, routeEdge{to: kb, m: m, widthM: widthM})
	g.nodes[kb].edges = append(g.nodes[kb].edges, routeEdge{to: ka, m: m, widthM: widthM})
}

func attach(g *routeGraph, raceways []Raceway, gate Gate) []float64 {
	pt := []float64{gate.Lng, gate.Lat}
	var best []float64
	bestM := math.Inf(1)
	for _, r := range raceways {
		c := r.Path.Coordinates
		for i := 1; i < len(c); i++ {
			t, d := g.project(pt, c[i-1], c[i])
			if d <= r.WidthM/2+gateReachM && d < bestM {
				best = []float64{c[i-1][0] + t*(c[i][0]-c[i-1][0]), c[i-1][1] + t*(c[i][1]-c[i-1][1])}
				bestM = d
			}
		}
	}
	return best
}

func buildGraph(raceways []Raceway, spots [][]float64, lat float64) *routeGraph {
	g := &routeGraph{nodes: map[string]*routeNode{}, k: metresPerDegree * math.Cos(lat*math.Pi/180)}
	points := append([][]float64{}, spots...)
	for _, r := range raceways {
		points = append(points, r.Path.Coordinates...)
	}
	type join struct {
		end, on []float64
		widthM  float64
	}
	var joins []join
	for i, r := range raceways {
		c := r.Path.Coordinates
		for _, end := range [][]float64{c[0], c[len(c)-1]} {
			for j, o := range raceways {
				if i == j {
					continue
				}
				oc := o.Path.Coordinates
				w := math.Min(r.WidthM, o.WidthM)
				for s := 1; s < len(oc); s++ {
					if t, d := g.project(end, oc[s-1], oc[s]); d > onRoadM && d <= w/2 {
						on := []float64{oc[s-1][0] + t*(oc[s][0]-oc[s-1][0]), oc[s-1][1] + t*(oc[s][1]-oc[s-1][1])}
						points = append(points, on)
						joins = append(joins, join{end, on, w})
					}
				}
			}
		}
	}
	for _, r := range raceways {
		c := r.Path.Coordinates
		for i := 1; i < len(c); i++ {
			type cut struct {
				t  float64
				pt []float64
			}
			cuts := []cut{{0, c[i-1]}, {1, c[i]}}
			for _, p := range points {
				if t, d := g.project(p, c[i-1], c[i]); d <= onRoadM && t > 0 && t < 1 {
					cuts = append(cuts, cut{t, p})
				}
			}
			sort.Slice(cuts, func(a, b int) bool { return cuts[a].t < cuts[b].t })
			for j := 1; j < len(cuts); j++ {
				g.link(cuts[j-1].pt, cuts[j].pt, r.WidthM)
			}
		}
	}
	for _, jn := range joins {
		g.link(jn.end, jn.on, jn.widthM)
	}
	return g
}

type queueItem struct {
	key string
	m   float64
}

type routeQueue []queueItem

func (q routeQueue) Len() int           { return len(q) }
func (q routeQueue) Less(i, j int) bool { return q[i].m < q[j].m }
func (q routeQueue) Swap(i, j int)      { q[i], q[j] = q[j], q[i] }
func (q *routeQueue) Push(x any)        { *q = append(*q, x.(queueItem)) }
func (q *routeQueue) Pop() any          { old := *q; it := old[len(old)-1]; *q = old[:len(old)-1]; return it }

func (g *routeGraph) shortest(starts, goals []string) ([][]float64, float64, bool) {
	dist := map[string]float64{}
	prev := map[string]string{}
	width := map[string]float64{}
	isGoal := map[string]bool{}
	for _, k := range goals {
		isGoal[k] = true
	}
	q := &routeQueue{}
	for _, k := range starts {
		if g.nodes[k] == nil {
			continue
		}
		dist[k] = 0
		width[k] = math.Inf(1)
		heap.Push(q, queueItem{k, 0})
	}
	for q.Len() > 0 {
		it := heap.Pop(q).(queueItem)
		if it.m > dist[it.key] {
			continue
		}
		if isGoal[it.key] {
			var path [][]float64
			for k := it.key; ; k = prev[k] {
				path = append([][]float64{g.nodes[k].pt}, path...)
				if _, ok := prev[k]; !ok {
					break
				}
			}
			return path, width[it.key], true
		}
		for _, e := range g.nodes[it.key].edges {
			m := it.m + e.m
			if old, seen := dist[e.to]; !seen || m < old {
				dist[e.to] = m
				prev[e.to] = it.key
				width[e.to] = math.Min(width[it.key], e.widthM)
				heap.Push(q, queueItem{e.to, m})
			}
		}
	}
	return nil, 0, false
}

func stepIn(g *routeGraph, ring [][]float64, gate []float64) (in, out []float64, ok bool) {
	var cx, cy float64
	n := len(ring) - 1
	for _, p := range ring[:n] {
		cx += p[0] / float64(n)
		cy += p[1] / float64(n)
	}
	gx, gy := g.xy(gate)
	mx, my := g.xy([]float64{cx, cy})
	l := math.Hypot(mx-gx, my-gy)
	if l == 0 {
		return nil, nil, false
	}
	ux, uy := (mx-gx)/l, (my-gy)/l
	at := func(m float64) []float64 { return []float64{(gx + ux*m) / g.k, (gy + uy*m) / metresPerDegree} }
	for _, m := range []float64{10, 6, 3} {
		if p := at(m); ringContains(ring, p) {
			in = p
			break
		}
	}
	if in == nil {
		return nil, nil, false
	}
	if p := at(-1.5); !ringContains(ring, p) {
		out = p
	}
	return in, out, true
}

func racewayRoute(ctx context.Context, farmerID, fromID, toID string) (LineString, float64, string, error) {
	from, err := getPaddock(ctx, farmerID, fromID)
	if err != nil {
		return LineString{}, 0, "", err
	}
	to, err := getPaddock(ctx, farmerID, toID)
	if err != nil {
		return LineString{}, 0, "", err
	}
	if from == nil || to == nil {
		return LineString{}, 0, "paddock not found", nil
	}
	raceways, err := queryRaceways(ctx, farmerID)
	if err != nil {
		return LineString{}, 0, "", err
	}
	path, width, msg := planRoute(raceways, *from, *to)
	return path, width, msg, nil
}

func planRoute(raceways []Raceway, from, to Paddock) (LineString, float64, string) {
	for _, p := range []Paddock{from, to} {
		if len(p.Gates) == 0 {
			return LineString{}, 0, p.Name + " has no gate yet"
		}
	}
	if len(raceways) == 0 {
		return LineString{}, 0, "draw the raceways first"
	}
	lat := from.Gates[0].Lat
	probe := &routeGraph{k: metresPerDegree * math.Cos(lat*math.Pi/180)}

	type spot struct {
		gate Gate
		at   []float64
	}
	place := func(p Paddock) []spot {
		var out []spot
		for _, gt := range p.Gates {
			if at := attach(probe, raceways, gt); at != nil {
				out = append(out, spot{gt, at})
			}
		}
		return out
	}
	starts, goals := place(from), place(to)
	if len(starts) == 0 {
		return LineString{}, 0, "no raceway reaches a gate of " + from.Name
	}
	if len(goals) == 0 {
		return LineString{}, 0, "no raceway reaches a gate of " + to.Name
	}

	var spots [][]float64
	for _, s := range append(append([]spot{}, starts...), goals...) {
		spots = append(spots, s.at)
	}
	g := buildGraph(raceways, spots, lat)
	keys := func(ss []spot) []string {
		var out []string
		for _, s := range ss {
			out = append(out, nodeKey(s.at))
		}
		return out
	}
	road, width, ok := g.shortest(keys(starts), keys(goals))
	if !ok {
		return LineString{}, 0, fmt.Sprintf("the raceways don't connect %s to %s", from.Name, to.Name)
	}

	gateFor := func(ss []spot, at []float64) []float64 {
		for _, s := range ss {
			if nodeKey(s.at) == nodeKey(at) {
				return []float64{s.gate.Lng, s.gate.Lat}
			}
		}
		return at
	}
	fromRing, toRing := from.Polygon.Coordinates[0], to.Polygon.Coordinates[0]
	inFrom, outFrom, ok := stepIn(g, fromRing, gateFor(starts, road[0]))
	if !ok {
		return LineString{}, 0, "could not find a way out of " + from.Name + " through its gate"
	}
	inTo, _, ok := stepIn(g, toRing, gateFor(goals, road[len(road)-1]))
	if !ok {
		return LineString{}, 0, "could not find a way into " + to.Name + " through its gate"
	}

	pts := [][]float64{inFrom}
	if outFrom != nil {
		pts = append(pts, outFrom)
	}
	pts = append(pts, road...)
	pts = append(pts, inTo)
	pts = dropStraight(g, pts)
	if len(pts) > maxPathPoints {
		return LineString{}, 0, fmt.Sprintf("the route has too many points (%d), simplify the raceways", len(pts))
	}
	return LineString{Type: "LineString", Coordinates: pts}, width, ""
}

func dropStraight(g *routeGraph, pts [][]float64) [][]float64 {
	out := [][]float64{pts[0]}
	for i := 1; i < len(pts)-1; i++ {
		if _, d := g.project(pts[i], out[len(out)-1], pts[i+1]); d > 0.2 {
			out = append(out, pts[i])
		}
	}
	return append(out, pts[len(pts)-1])
}
