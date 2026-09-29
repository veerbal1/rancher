package main

type State int

const (
	Inside State = iota
	Warning
	Breached
)

func (s State) String() string {
	switch s {
	case Inside:
		return "inside"
	case Warning:
		return "warning"
	case Breached:
		return "breached"
	default:
		return "unknown"
	}
}

type Cue int

const (
	CueNone Cue = iota
	CueAudio
	CueVibration
	CuePulse
)

func (c Cue) String() string {
	switch c {
	case CueNone:
		return "none"
	case CueAudio:
		return "audio"
	case CueVibration:
		return "vibration"
	case CuePulse:
		return "pulse"
	default:
		return "unknown"
	}
}

const (
	escalateAfter = 8
	calmAfter     = 3
)

type Collar struct {
	ID        string
	Number    int
	PaddockID string
	cow       *Cow
	fence     Polygon
	warnM     float64

	state  State
	level  Cue
	dwell  int
	calm   int
	gaveUp bool
}

func NewCollar(id string, number int, paddockID string, fence Polygon, c *Cow, warnM float64) *Collar {
	return &Collar{ID: id, Number: number, PaddockID: paddockID, cow: c, fence: fence, warnM: warnM, state: Inside}
}

func (col *Collar) SetFence(paddockID string, fence Polygon) {
	col.PaddockID = paddockID
	col.fence = fence
}

func (col *Collar) State() State { return col.state }

func (col *Collar) Level() Cue { return col.level }

func (col *Collar) Observe() Cue {
	raw := zoneToState(col.fence.Evaluate(col.cow.Lng, col.cow.Lat, col.warnM))

	switch {
	case raw > col.state:
		col.state = raw
		col.calm = 0
		if col.level == CueNone && !col.gaveUp {
			col.dwell = 0
			col.level = CueAudio
			return CueAudio
		}
		return CueNone

	case raw < col.state:
		col.calm++
		if col.calm < calmAfter {
			return CueNone
		}
		col.calm = 0
		col.state = raw
		col.dwell = 0
		col.level = CueNone
		col.gaveUp = false
		return CueNone

	default:
		col.calm = 0
		col.dwell++
		if col.level == CueNone || col.gaveUp {
			return CueNone
		}
		if col.dwell%escalateAfter != 0 {
			return CueNone
		}
		col.level++
		if col.level > CuePulse {
			col.level = CueNone
			col.gaveUp = true
		}
		return col.level
	}
}

func (col *Collar) Step(dt float64) {
	col.cow.Step(dt)
	if cue := col.Observe(); cue != CueNone {
		col.respond(cue)
	}
}

func (col *Collar) respond(cue Cue) {
	lng, lat := col.fence.Center()
	switch cue {
	case CueAudio:
		col.cow.SteerTo(lng, lat, 0.2)
	case CueVibration:
		col.cow.SteerTo(lng, lat, 0.6)
	case CuePulse:
		col.cow.TurnAround()
	}
}

func zoneToState(z Zone) State {
	switch z {
	case ZoneWarning:
		return Warning
	case ZoneOutside:
		return Breached
	default:
		return Inside
	}
}

func (s State) MarshalText() ([]byte, error) { return []byte(s.String()), nil }
func (c Cue) MarshalText() ([]byte, error)   { return []byte(c.String()), nil }
