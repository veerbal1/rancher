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
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Cow struct {
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

func handle(ctx context.Context, req events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
	farmer := req.QueryStringParameters["farmer"]
	if farmer == "" {
		return events.LambdaFunctionURLResponse{StatusCode: 400, Body: `{"error":"farmer is required"}`}, nil
	}

	out, err := db.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		KeyConditionExpression: aws.String("farmer_id = :farmer"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":farmer": &types.AttributeValueMemberS{Value: farmer},
		},
	})
	if err != nil {
		return events.LambdaFunctionURLResponse{}, err
	}

	var cows []Cow
	if err := attributevalue.UnmarshalListOfMaps(out.Items, &cows); err != nil {
		return events.LambdaFunctionURLResponse{}, err
	}
	if cows == nil {
		cows = []Cow{} // return [] instead of null for an empty farm
	}

	body, err := json.Marshal(cows)
	if err != nil {
		return events.LambdaFunctionURLResponse{}, err
	}
	return events.LambdaFunctionURLResponse{
		StatusCode: 200,
		Headers:    map[string]string{"Content-Type": "application/json"},
		Body:       string(body),
	}, nil
}
