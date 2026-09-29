package main

import (
	"fmt"
	"math"
	"testing"
)

const (
	originLng = 175.56
	originLat = -37.68
)

func at(xM, yM float64) Point {
	return Point{
		Lng: originLng + xM/(metresPerDeg*math.Cos(originLat*math.Pi/180)),
		Lat: originLat + yM/metresPerDeg,
	}
}

func polygonM(pts ...[2]float64) Polygon {
	p := make(Polygon, len(pts))
	for i, xy := range pts {
		p[i] = at(xy[0], xy[1])
	}
	return p
}

func square(sizeM float64) Polygon {
	return polygonM([2]float64{0, 0}, [2]float64{sizeM, 0}, [2]float64{sizeM, sizeM}, [2]float64{0, sizeM})
}

func lShape() Polygon {
	return polygonM(
		[2]float64{0, 0}, [2]float64{100, 0}, [2]float64{100, 50},
		[2]float64{50, 50}, [2]float64{50, 100}, [2]float64{0, 100},
	)
}

func ring(p Polygon) [][2]float64 {
	r := make([][2]float64, 0, len(p)+1)
	for _, pt := range p {
		r = append(r, [2]float64{pt.Lng, pt.Lat})
	}
	return append(r, r[0])
}

func distanceM(a, b Point) float64 {
	dx := (b.Lng - a.Lng) * metresPerDeg * math.Cos(b.Lat*math.Pi/180)
	dy := (b.Lat - a.Lat) * metresPerDeg
	return math.Hypot(dx, dy)
}

func approx(t *testing.T, name string, got, want, tol float64) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Errorf("%s = %v, want %v (±%v)", name, got, want, tol)
	}
}

func worldPaddock(id string, p Polygon) WorldPaddock {
	wp := WorldPaddock{ID: id, Name: id}
	wp.Polygon.Coordinates = [][][2]float64{ring(p)}
	return wp
}

func worldCollar(id string, number int, paddockID string) WorldCollar {
	c := WorldCollar{ID: id, Number: number, Name: fmt.Sprintf("Collar #%d", number)}
	if paddockID != "" {
		c.PaddockID = &paddockID
	}
	return c
}

func farm(paddocks []WorldPaddock, collars ...WorldCollar) WorldFarm {
	return WorldFarm{FarmerID: "F1", Name: "Test farm", Paddocks: paddocks, Collars: collars}
}
