package telemetry

import (
	"bytes"
	"compress/gzip"
	"io"
	"strings"
	"time"

	"google.golang.org/protobuf/proto"
)

type Event struct {
	FarmerID     string  `json:"farmer_id"  dynamodbav:"farmer_id"`
	Seq          uint64  `json:"seq"        dynamodbav:"seq"`
	Time         string  `json:"time"       dynamodbav:"time"`
	CollarID     string  `json:"collar_id"  dynamodbav:"collar_id"`
	Number       int     `json:"number"     dynamodbav:"number"`
	PaddockID    string  `json:"paddock_id" dynamodbav:"paddock_id"`
	Lat          float64 `json:"lat"        dynamodbav:"lat"`
	Lng          float64 `json:"lng"        dynamodbav:"lng"`
	Heading      float64 `json:"heading"    dynamodbav:"heading"`
	State        string  `json:"state"      dynamodbav:"state"`
	Level        string  `json:"level"      dynamodbav:"level"`
	Side         string  `json:"side"       dynamodbav:"side"`
	FenceVersion int     `json:"fence_version" dynamodbav:"fence_version"`
	Battery      int     `json:"battery"    dynamodbav:"battery"`
}

func Decode(data []byte) ([]Event, error) {
	r, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	b, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	var fs FarmSecond
	if err := proto.Unmarshal(b, &fs); err != nil {
		return nil, err
	}

	t := time.UnixMilli(fs.TimeMs).UTC().Format(time.RFC3339Nano)
	events := make([]Event, 0, len(fs.Cows))
	for _, c := range fs.Cows {
		events = append(events, Event{
			FarmerID:     fs.FarmerId,
			Seq:          c.Seq,
			Time:         t,
			Number:       int(c.Number),
			PaddockID:    c.PaddockId,
			Lat:          float64(c.LatE6) / 1e6,
			Lng:          float64(c.LngE6) / 1e6,
			Heading:      float64(c.HeadingDeg),
			State:        strings.ToLower(c.State.String()),
			Level:        word(c.Level.String(), "CUE_"),
			Side:         word(c.Side.String(), "SIDE_"),
			FenceVersion: int(c.FenceVersion),
			Battery:      int(c.Battery),
		})
	}
	return events, nil
}

func word(name, prefix string) string {
	return strings.ToLower(strings.TrimPrefix(name, prefix))
}
