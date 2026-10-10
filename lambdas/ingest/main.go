package main

import (
	"context"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/veerbal1/rancher/telemetry"
)

var (
	db     *dynamodb.Client
	roster *telemetry.Roster
	table  = os.Getenv("TABLE_NAME")
)

func main() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("aws config: %v", err)
	}
	db = dynamodb.NewFromConfig(cfg)
	roster = telemetry.NewRoster(db, os.Getenv("RANCHER_TABLE"))
	lambda.Start(handle)
}

func handle(ctx context.Context, in events.KinesisEvent) error {
	latest := map[string]telemetry.Event{}
	for _, r := range in.Records {
		cows, err := telemetry.Decode(r.Kinesis.Data)
		if err != nil {
			log.Printf("skip bad record: %v", err)
			continue
		}
		if err := roster.Fill(ctx, cows); err != nil {
			return err
		}
		for _, e := range cows {
			if e.FarmerID != "" && e.CollarID != "" {
				latest[e.CollarID] = e
			}
		}
	}

	writes := make([]types.WriteRequest, 0, len(latest))
	for _, e := range latest {
		item, err := attributevalue.MarshalMap(e)
		if err != nil {
			return err
		}
		writes = append(writes, types.WriteRequest{PutRequest: &types.PutRequest{Item: item}})
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
