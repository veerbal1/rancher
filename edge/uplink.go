package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"log"
	"math"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kinesis"
	"github.com/aws/aws-sdk-go-v2/service/kinesis/types"
	"github.com/veerbal1/rancher/telemetry"
	"google.golang.org/protobuf/proto"
)

func Uplink(events <-chan Event, client *kinesis.Client) {
	batch := map[string][]Event{}
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		case e, ok := <-events:
			if !ok {
				send(client, batch)
				return
			}
			batch[e.FarmerID] = append(batch[e.FarmerID], e)
		case <-ticker.C:
			send(client, batch)
			batch = map[string][]Event{}
		}
	}
}

func send(client *kinesis.Client, batch map[string][]Event) {
	if len(batch) == 0 {
		return
	}
	entries := make([]types.PutRecordsRequestEntry, 0, len(batch))
	for farmerID, farm := range batch {
		j, err := json.Marshal(farm)
		if err != nil {
			log.Printf("marshal json: %v", err)
			continue
		}
		b, err := proto.Marshal(toProto(farmerID, farm))
		if err != nil {
			log.Printf("marshal proto: %v", err)
			continue
		}
		var gz bytes.Buffer
		w := gzip.NewWriter(&gz)
		w.Write(b)
		w.Close()
		entries = append(entries, types.PutRecordsRequestEntry{
			Data:         gz.Bytes(),
			PartitionKey: aws.String(farmerID),
		})
		log.Printf("farm %s: %d cows, %d KB json, %d KB proto, %d KB proto+gzip", farmerID, len(farm), len(j)/1024, len(b)/1024, gz.Len()/1024)
	}

	out, err := client.PutRecords(context.Background(), &kinesis.PutRecordsInput{
		StreamName: aws.String("cow-events"),
		Records:    entries,
	})
	if err != nil {
		log.Printf("put records: %v", err)
		return
	}
	if n := aws.ToInt32(out.FailedRecordCount); n > 0 {
		log.Printf("%d of %d records failed", n, len(entries))
	}
}

func toProto(farmerID string, farm []Event) *telemetry.FarmSecond {
	out := &telemetry.FarmSecond{FarmerId: farmerID, TimeMs: farm[0].Time.UnixMilli()}
	for _, e := range farm {
		out.Cows = append(out.Cows, &telemetry.Cow{
			Number:       uint32(e.Number),
			PaddockId:    e.PaddockID,
			Seq:          e.Seq,
			LatE6:        int32(math.Round(e.Lat * 1e6)),
			LngE6:        int32(math.Round(e.Lng * 1e6)),
			HeadingDeg:   uint32(math.Mod(math.Round(e.Heading)+360, 360)),
			State:        telemetry.State(e.State),
			Level:        telemetry.Cue(e.Level),
			Side:         telemetry.Side(e.Side),
			FenceVersion: uint32(e.FenceVersion),
			Battery:      uint32(e.Battery),
		})
	}
	return out
}
