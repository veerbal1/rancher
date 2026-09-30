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

type Side int

const (
	SideNone Side = iota
	SideLeft
	SideRight
	SideBoth
)

func (s Side) String() string {
	switch s {
	case SideLeft:
		return "left"
	case SideRight:
		return "right"
	case SideBoth:
		return "both"
	default:
		return "none"
	}
}

const (
	escalateAfter = 8
	calmAfter     = 3
	threatSecs    = 10.0
	awayRad       = 120 * math.Pi / 180
	headOnRad     = math.Pi / 180
	behindRad     = 150 * math.Pi / 180
)

var cueTurnRad = [...]float64{
	CueNone:      0,
	CueAudio:     40 * math.Pi / 180,
	CueVibration: 60 * math.Pi / 180,
	CuePulse:     90 * math.Pi / 180,
}

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

	side         Side
	fenceVersion int

	shift     *Shift
	guiding   bool
	guideSide Side
	guideTurn float64
}

func NewCollar(id string, number int, paddockID string, fence Polygon, c *Cow, warnM float64) *Collar {
	return &Collar{ID: id, Number: number, PaddockID: paddockID, cow: c, fence: fence, warnM: warnM, state: Inside}
}

func (col *Collar) SetFence(paddockID string, fence Polygon) {
	col.PaddockID = paddockID
	col.fence = fence
	col.shift = nil
	col.cow.Wander = grazeWander
}

func (col *Collar) StartShift(s *Shift) {
	col.PaddockID = s.ToID
	col.shift = s
	col.fenceVersion = s.ToVersion
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

func (col *Collar) Side() Side {
	switch {
	case col.level != CueNone && col.side != SideNone:
		return col.side
	case col.guiding:
		return col.guideSide
	}
	return SideNone
}

func (col *Collar) assess() (State, Side) {
	lng, lat := col.cow.Lng, col.cow.Lat
	if !col.fence.Contains(lng, lat) {
		homeLng, homeLat := col.fence.Home(lng, lat)
		return Breached, sideToward(col.cow.BearingDiff(homeLng, homeLat))
	}

	left, right, ahead := false, false, false
	for _, w := range col.fence.Walls(lng, lat) {
		rel := col.cow.BearingDiff(w.Lng, w.Lat)
		distM := metresBetween(lng, lat, w)
		closing := col.cow.Speed * math.Cos(rel)
		approaching := closing > 0 && distM/closing <= threatSecs
		unfinished := col.shift == nil && col.level != CueNone && distM <= col.warnM && math.Abs(rel) < awayRad
		if !approaching && !unfinished {
			continue
		}
		switch {
		case rel > headOnRad:
			right = true
		case rel < -headOnRad:
			left = true
		default:
			ahead = true
		}
	}

	switch {
	case left && right:
		return Warning, SideBoth
	case right:
		return Warning, SideRight
	case left:
		return Warning, SideLeft
	case ahead && col.cow.rng.Float64() < 0.5:
		return Warning, SideLeft
	case ahead:
		return Warning, SideRight
	}
	return Inside, SideNone
}

func sideToward(diff float64) Side {
	switch {
	case math.Abs(diff) > behindRad:
		return SideBoth
	case diff < -headOnRad:
		return SideRight
	case diff > headOnRad:
		return SideLeft
	}
	return SideNone
}

func (col *Collar) Observe() Cue {
	raw, side := col.assess()
	col.side = side

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
	col.Observe()
	switch {
	case col.level != CueNone:
		if col.side != SideNone {
			col.cow.TurnFrom(col.side, cueTurnRad[col.level])
			col.cow.Startle()
		}
	case col.guiding:
		col.cow.TurnFrom(col.guideSide, col.guideTurn)
	}
}

func (col *Collar) followShift(now time.Time) {
	s := col.shift
	if s == nil || now.Before(s.Start) {
		col.guiding, col.guideSide = false, SideNone
		return
	}

	lng, lat := col.cow.Lng, col.cow.Lat
	if s.To.Evaluate(lng, lat, col.warnM) == ZoneInside {
		col.fence, col.shift, col.guiding, col.guideSide = s.To, nil, false, SideNone
		col.cow.Wander = grazeWander
		return
	}

	col.fence = s.Fence
	targetLng, targetLat, driftM := s.Guide(lng, lat)
	col.cow.Wander = grazeWander
	if !s.From.Contains(lng, lat) && !s.To.Contains(lng, lat) {
		col.cow.Wander = laneWander
		col.cow.SteerTo(targetLng, targetLat, followRate)
	}
	col.guide(targetLng, targetLat, driftM)
}

func (col *Collar) guide(lng, lat, driftM float64) {
	diff := col.cow.BearingDiff(lng, lat)
	off := math.Abs(diff)
	switch {
	case !col.guiding && (off > cueStartRad || driftM > driftStartM):
		col.guiding = true
	case col.guiding && off < cueStopRad && driftM < driftStopM:
		col.guiding = false
	}
	col.guideSide, col.guideTurn = sideToward(diff), guideRate*off
}

func (s State) MarshalText() ([]byte, error) { return []byte(s.String()), nil }
func (c Cue) MarshalText() ([]byte, error)   { return []byte(c.String()), nil }
func (s Side) MarshalText() ([]byte, error)  { return []byte(s.String()), nil }
