package main

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kinesis"
	"github.com/aws/aws-sdk-go-v2/service/kinesis/types"
)

func Uplink(events <-chan Event, client *kinesis.Client) {
	var batch []Event
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		case e, ok := <-events:
			if !ok {
				send(client, batch)
				return
			}
			batch = append(batch, e)
			if len(batch) == 500 {
				send(client, batch)
				batch = nil
			}
		case <-ticker.C:
			send(client, batch)
			batch = nil
		}
	}
}

func send(client *kinesis.Client, batch []Event) {
	if len(batch) == 0 {
		return
	}
	entries := make([]types.PutRecordsRequestEntry, 0, len(batch))
	for _, e := range batch {
		b, err := json.Marshal(e)
		if err != nil {
			log.Printf("marshal: %v", err)
			continue
		}
		entries = append(entries, types.PutRecordsRequestEntry{
			Data:         b,
			PartitionKey: aws.String(e.FarmerID),
		})
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
	log.Printf("sent %d records", len(entries))
}
