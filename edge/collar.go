package main

import (
	"math"
	"time"
)

type State int

const (
	Inside State = iota
	Warning
	Breached
	Moving
)

func (s State) String() string {
	switch s {
	case Inside:
		return "inside"
	case Warning:
		return "warning"
	case Breached:
		return "breached"
	case Moving:
		return "moving"
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
	fence     Fence
	warnM     float64

	state  State
	level  Cue
	dwell  int
	calm   int
	gaveUp bool

	shift   *Shift
	guiding bool
}

func NewCollar(id string, number int, paddockID string, fence Polygon, c *Cow, warnM float64) *Collar {
	return &Collar{ID: id, Number: number, PaddockID: paddockID, cow: c, fence: fence, warnM: warnM, state: Inside}
}

func (col *Collar) SetFence(paddockID string, fence Polygon) {
	col.PaddockID = paddockID
	col.fence = fence
	col.shift = nil
}

func (col *Collar) StartShift(s *Shift) {
	col.PaddockID = s.ToID
	col.shift = s
}

func (col *Collar) State() State {
	if col.shift != nil && col.state == Inside {
		return Moving
	}
	return col.state
}

func (col *Collar) Level() Cue {
	if col.level == CueNone && col.guiding {
		return CueAudio
	}
	return col.level
}

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

func (col *Collar) Step(now time.Time, dt float64) {
	col.cow.Step(dt)
	col.followShift(now)
	if col.Observe() == CuePulse {
		col.cow.TurnAround()
	}
	col.respond()
}

func (col *Collar) followShift(now time.Time) {
	s := col.shift
	if s == nil || now.Before(s.Start) {
		col.guiding = false
		return
	}

	lng, lat := col.cow.Lng, col.cow.Lat
	if s.To.Evaluate(lng, lat, col.warnM) == ZoneInside {
		col.fence, col.shift, col.guiding = s.To, nil, false
		return
	}

	col.fence = s.Fence
	col.guide(s.Target(lng, lat))
}

func (col *Collar) guide(lng, lat float64) {
	off := math.Abs(col.cow.BearingDiff(lng, lat))
	switch {
	case col.guiding && off < cueStopRad:
		col.guiding = false
	case !col.guiding && off > cueStartRad:
		col.guiding = true
	}
	if col.guiding {
		col.cow.SteerTo(lng, lat, guideRate)
	}
}

func (col *Collar) respond() {
	lng, lat := col.fence.Home(col.cow.Lng, col.cow.Lat)
	switch col.level {
	case CueAudio:
		col.cow.SteerTo(lng, lat, 0.3)
	case CueVibration:
		col.cow.SteerTo(lng, lat, 0.6)
	case CuePulse:
		col.cow.SteerTo(lng, lat, 0.9)
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
