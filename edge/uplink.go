package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kinesis"
	"github.com/aws/aws-sdk-go-v2/service/kinesis/types"
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
		b, err := json.Marshal(farm)
		if err != nil {
			log.Printf("marshal: %v", err)
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
		log.Printf("farm %s: %d cows, %d KB json, %d KB gzip", farmerID, len(farm), len(b)/1024, gz.Len()/1024)
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
