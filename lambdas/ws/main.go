package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Connection struct {
	ConnectionID string `dynamodbav:"connection_id"`
	FarmerID     string `dynamodbav:"farmer_id"`
	ExpiresAt    int64  `dynamodbav:"expires_at"`
}

const maxConnection = 2 * time.Hour

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

func handle(ctx context.Context, req events.APIGatewayWebsocketProxyRequest) (events.APIGatewayProxyResponse, error) {
	id := req.RequestContext.ConnectionID
	switch req.RequestContext.RouteKey {
	case "$connect":
		farmer := req.QueryStringParameters["farmer"]
		if farmer == "" {
			return events.APIGatewayProxyResponse{StatusCode: 400}, nil
		}
		item, err := attributevalue.MarshalMap(Connection{
			ConnectionID: id,
			FarmerID:     farmer,
			ExpiresAt:    time.Now().Add(maxConnection).Unix(),
		})
		if err != nil {
			return events.APIGatewayProxyResponse{}, err
		}
		if _, err := db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(table), Item: item}); err != nil {
			return events.APIGatewayProxyResponse{}, err
		}
		log.Printf("connected %s farmer=%s", id, farmer)
	case "$disconnect":
		if _, err := db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
			TableName: aws.String(table),
			Key:       map[string]types.AttributeValue{"connection_id": &types.AttributeValueMemberS{Value: id}},
		}); err != nil {
			return events.APIGatewayProxyResponse{}, err
		}
		log.Printf("disconnected %s", id)
	}
	return events.APIGatewayProxyResponse{StatusCode: 200}, nil
}
