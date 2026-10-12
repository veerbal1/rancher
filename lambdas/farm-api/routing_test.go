package main

import (
	"math"
	"strings"
	"testing"
)

const testLat = -38.0

func at(x, y float64) []float64 {
	k := metresPerDegree * math.Cos(testLat*math.Pi/180)
	return []float64{175 + x/k, testLat + y/metresPerDegree}
}

func square(name string, x0, y0, size float64, gates ...[2]float64) Paddock {
	ring := [][]float64{at(x0, y0), at(x0+size, y0), at(x0+size, y0+size), at(x0, y0+size), at(x0, y0)}
	p := Paddock{Name: name, Polygon: Polygon{Type: "Polygon", Coordinates: [][][]float64{ring}}}
	for i, g := range gates {
		pt := at(g[0], g[1])
		p.Gates = append(p.Gates, Gate{ID: name + string(rune('a'+i)), Name: "Gate", Lng: pt[0], Lat: pt[1]})
	}
	return p
}

func road(width float64, pts ...[2]float64) Raceway {
	r := Raceway{WidthM: width, Path: LineString{Type: "LineString"}}
	for _, p := range pts {
		r.Path.Coordinates = append(r.Path.Coordinates, at(p[0], p[1]))
	}
	return r
}

func routeLengthM(path [][]float64) float64 {
	g := &routeGraph{k: metresPerDegree * math.Cos(testLat*math.Pi/180)}
	total := 0.0
	for i := 1; i < len(path); i++ {
		total += g.dist(path[i-1], path[i])
	}
	return total
}

func passes(path [][]float64, x, y float64) bool {
	g := &routeGraph{k: metresPerDegree * math.Cos(testLat*math.Pi/180)}
	for i := 1; i < len(path); i++ {
		if _, d := g.project(at(x, y), path[i-1], path[i]); d < 0.5 {
			return true
		}
	}
	return false
}

func checkEnds(t *testing.T, path LineString, from, to Paddock) {
	t.Helper()
	c := path.Coordinates
	if !ringContains(from.Polygon.Coordinates[0], c[0]) {
		t.Fatalf("route should start inside %s", from.Name)
	}
	if ringContains(from.Polygon.Coordinates[0], c[1]) {
		t.Fatalf("route should leave %s straight after its first point", from.Name)
	}
	if !ringContains(to.Polygon.Coordinates[0], c[len(c)-1]) {
		t.Fatalf("route should end inside %s", to.Name)
	}
}

func TestPlanRouteStraightRoad(t *testing.T) {
	a := square("A", 0, 0, 100, [2]float64{100, 50})
	b := square("B", 200, 0, 100, [2]float64{200, 50})
	path, width, msg := planRoute([]Raceway{road(5, [2]float64{100, 50}, [2]float64{200, 50})}, a, b)
	if msg != "" {
		t.Fatal(msg)
	}
	checkEnds(t, path, a, b)
	if width != 5 {
		t.Fatalf("width = %v, want 5", width)
	}
	if !passes(path.Coordinates, 150, 50) {
		t.Fatal("route should follow the road")
	}
}

func TestPlanRouteThroughTJunctions(t *testing.T) {
	a := square("A", 0, 0, 100, [2]float64{50, 100})
	b := square("B", 200, 0, 100, [2]float64{250, 100})
	raceways := []Raceway{
		road(6, [2]float64{0, 150}, [2]float64{300, 150}),
		road(4, [2]float64{50, 100}, [2]float64{50, 150}),
		road(5, [2]float64{250, 100}, [2]float64{250, 150}),
	}
	path, width, msg := planRoute(raceways, a, b)
	if msg != "" {
		t.Fatal(msg)
	}
	checkEnds(t, path, a, b)
	if !passes(path.Coordinates, 50, 150) || !passes(path.Coordinates, 250, 150) {
		t.Fatal("route should turn onto the main road at both junctions")
	}
	if width != 4 {
		t.Fatalf("width = %v, want the narrowest road on the route (4)", width)
	}
}

func TestPlanRoutePicksTheNearerGate(t *testing.T) {
	a := square("A", 0, 0, 100, [2]float64{50, 100}, [2]float64{100, 50})
	b := square("B", 200, 0, 100, [2]float64{200, 50})
	raceways := []Raceway{
		road(5, [2]float64{100, 50}, [2]float64{200, 50}),
		road(5, [2]float64{50, 100}, [2]float64{50, 200}, [2]float64{200, 200}, [2]float64{200, 50}),
	}
	path, _, msg := planRoute(raceways, a, b)
	if msg != "" {
		t.Fatal(msg)
	}
	if got := routeLengthM(path.Coordinates); got > 150 {
		t.Fatalf("route is %.0f m, want the short road through the east gate", got)
	}
}

func TestPlanRouteFailsWhenRoadsDoNotConnect(t *testing.T) {
	a := square("A", 0, 0, 100, [2]float64{50, 100})
	b := square("B", 200, 0, 100, [2]float64{250, 100})
	raceways := []Raceway{
		road(5, [2]float64{50, 100}, [2]float64{50, 150}),
		road(5, [2]float64{250, 100}, [2]float64{250, 150}),
	}
	if _, _, msg := planRoute(raceways, a, b); !strings.Contains(msg, "don't connect") {
		t.Fatalf("msg = %q, want a 'don't connect' error", msg)
	}
}

func TestPlanRouteNeedsGates(t *testing.T) {
	a := square("A", 0, 0, 100)
	b := square("B", 200, 0, 100, [2]float64{200, 50})
	if _, _, msg := planRoute([]Raceway{road(5, [2]float64{100, 50}, [2]float64{200, 50})}, a, b); msg != "A has no gate yet" {
		t.Fatalf("msg = %q", msg)
	}
}

func TestPlanRouteJoinsRoadsThatOverlap(t *testing.T) {
	a := square("A", 0, 0, 100, [2]float64{50, 100})
	b := square("B", 200, 0, 100, [2]float64{250, 100})
	main := road(5, [2]float64{0, 150}, [2]float64{300, 150})
	spurB := road(5, [2]float64{250, 100}, [2]float64{250, 150})
	if _, _, msg := planRoute([]Raceway{main, road(5, [2]float64{50, 100}, [2]float64{50, 148.2}), spurB}, a, b); msg != "" {
		t.Fatalf("a road ending 1.8 m from another (inside its 2.5 m half width) should join it: %s", msg)
	}
	if _, _, msg := planRoute([]Raceway{main, road(5, [2]float64{50, 100}, [2]float64{50, 145}), spurB}, a, b); !strings.Contains(msg, "don't connect") {
		t.Fatalf("a road ending 5 m short should not join, got %q", msg)
	}
}
