package main

type Collar struct {
	cow   *Cow
	fence Rect
	warnM float64
}

func NewCollar(c *Cow, f Rect, warnM float64) *Collar {
	return &Collar{cow: c, fence: f, warnM: warnM}
}

func (col *Collar) Zone() Zone {
	return col.fence.Evaluate(col.cow.X, col.cow.Y, col.warnM)
}

func (col *Collar) Step(dt float64) {
	col.cow.Step(dt)

	switch col.Zone() {
	case Warning:
		x, y := col.fence.Center()
		col.cow.SteerTo(x, y, 0.2)
	case Outside:
		col.cow.TurnAround()
	}
}
