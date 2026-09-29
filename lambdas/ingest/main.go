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
	FarmerID  string  `json:"farmer_id"  dynamodbav:"farmer_id"`
	Seq       uint64  `json:"seq"        dynamodbav:"seq"`
	Time      string  `json:"time"       dynamodbav:"time"`
	CollarID  string  `json:"collar_id"  dynamodbav:"collar_id"`
	PaddockID string  `json:"paddock_id" dynamodbav:"paddock_id"`
	Lat       float64 `json:"lat"        dynamodbav:"lat"`
	Lng       float64 `json:"lng"        dynamodbav:"lng"`
	State     string  `json:"state"      dynamodbav:"state"`
	Level     string  `json:"level"      dynamodbav:"level"`
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
	saved := 0
	for _, r := range in.Records {
		var e Event
		if err := json.Unmarshal(r.Kinesis.Data, &e); err != nil {
			log.Printf("skip bad record: %v", err)
			continue
		}
		if e.FarmerID == "" || e.CollarID == "" {
			log.Printf("skip record without farmer_id or collar_id: %s", r.Kinesis.Data)
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
		saved++
	}
	log.Printf("saved %d of %d records", saved, len(in.Records))
	return nil
}
