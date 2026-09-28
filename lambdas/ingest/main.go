package main

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
)

type Event struct {
	SimID string  `json:"sim_id" dynamodbav:"sim_id"`
	Seq   uint64  `json:"seq"    dynamodbav:"seq"`
	Time  string  `json:"time"   dynamodbav:"time"`
	CowID string  `json:"cow_id" dynamodbav:"cow_id"`
	X     float64 `json:"x"      dynamodbav:"x"`
	Y     float64 `json:"y"      dynamodbav:"y"`
	State string  `json:"state"  dynamodbav:"state"`
	Level string  `json:"level"  dynamodbav:"level"`
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
	for _, r := range in.Records {
		var e Event
		if err := json.Unmarshal(r.Kinesis.Data, &e); err != nil {
			log.Printf("skip bad record: %v", err)
			continue
		}
		item, err := attributevalue.MarshalMap(e)
		if err != nil {
			return err
		}
		if _, err := db.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: aws.String(table),
			Item:      item,
		}); err != nil {
			return err
		}
	}
	log.Printf("saved %d records", len(in.Records))
	return nil
}
