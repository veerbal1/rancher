package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Event struct {
	FarmerID     string  `json:"farmer_id"  dynamodbav:"farmer_id"`
	Seq          uint64  `json:"seq"        dynamodbav:"seq"`
	Time         string  `json:"time"       dynamodbav:"time"`
	CollarID     string  `json:"collar_id"  dynamodbav:"collar_id"`
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

var (
	db    *dynamodb.Client
	table = os.Getenv("TABLE_NAME")
)

func main() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("aws config: %v", err)
	}
	db = dynamodb.NewFromConfig(cfg)
	lambda.Start(handle)
}

func handle(ctx context.Context, in events.KinesisEvent) error {
	var writes []types.WriteRequest
	for _, r := range in.Records {
		var cows []Event
		if err := unzipJSON(r.Kinesis.Data, &cows); err != nil {
			log.Printf("skip bad record: %v", err)
			continue
		}
		for _, e := range cows {
			if e.FarmerID == "" || e.CollarID == "" {
				continue
			}
			item, err := attributevalue.MarshalMap(e)
			if err != nil {
				return err
			}
			writes = append(writes, types.WriteRequest{PutRequest: &types.PutRequest{Item: item}})
		}
	}

	for i := 0; i < len(writes); i += 25 {
		pending := writes[i:min(i+25, len(writes))]
		for len(pending) > 0 {
			out, err := db.BatchWriteItem(ctx, &dynamodb.BatchWriteItemInput{
				RequestItems: map[string][]types.WriteRequest{table: pending},
			})
			if err != nil {
				return err
			}
			pending = out.UnprocessedItems[table]
		}
	}
	log.Printf("saved %d cows from %d records", len(writes), len(in.Records))
	return nil
}

func unzipJSON(data []byte, v any) error {
	r, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return err
	}
	defer r.Close()
	return json.NewDecoder(r).Decode(v)
}
