package main

type Rect struct {
	MinX float64
	MinY float64
	MaxX float64
	MaxY float64
}

func (r Rect) Contains(x, y float64) bool {
	return x >= r.MinX && x <= r.MaxX && y >= r.MinY && y <= r.MaxY
}

func (r Rect) DistanceToEdge(x, y float64) float64 {
	west := x - r.MinX
	east := r.MaxX - x
	south := y - r.MinY
	north := r.MaxY - y

	return min(west, east, south, north)
}

func (r Rect) Center() (float64, float64) {
	return (r.MinX + r.MaxX) / 2, (r.MinY + r.MaxY) / 2
}

type Zone int

const (
	Inside Zone = iota
	Warning
	Outside
)

func (z Zone) String() string {
	switch z {
	case Inside:
		return "inside"
	case Warning:
		return "warning"
	case Outside:
		return "outside"
	default:
		return "unknown"
	}
}

func (r Rect) Evaluate(x, y, warnM float64) Zone {
	d := r.DistanceToEdge(x, y)
	if d < 0 {
		return Outside
	}
	if d <= warnM {
		return Warning
	}

	return Inside
}
