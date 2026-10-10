package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/apigatewaymanagementapi"
	gwtypes "github.com/aws/aws-sdk-go-v2/service/apigatewaymanagementapi/types"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const maxMessageBytes = 100_000

type key struct {
	FarmerID string `json:"farmer_id"`
	CollarID string `json:"collar_id"`
}

var (
	db    *dynamodb.Client
	gw    *apigatewaymanagementapi.Client
	table = os.Getenv("TABLE_NAME")
)

func main() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("aws config: %v", err)
	}
	db = dynamodb.NewFromConfig(cfg)
	gw = apigatewaymanagementapi.NewFromConfig(cfg, func(o *apigatewaymanagementapi.Options) {
		o.BaseEndpoint = aws.String(os.Getenv("WS_ENDPOINT"))
	})
	lambda.Start(handle)
}

func handle(ctx context.Context, in events.KinesisEvent) error {
	latest := map[string]map[string]json.RawMessage{}
	for _, r := range in.Records {
		var cows []json.RawMessage
		if err := unzipJSON(r.Kinesis.Data, &cows); err != nil {
			log.Printf("skip bad record: %v", err)
			continue
		}
		for _, c := range cows {
			var k key
			if err := json.Unmarshal(c, &k); err != nil || k.FarmerID == "" || k.CollarID == "" {
				continue
			}
			if latest[k.FarmerID] == nil {
				latest[k.FarmerID] = map[string]json.RawMessage{}
			}
			latest[k.FarmerID][k.CollarID] = c
		}
	}

	for farmer, byCollar := range latest {
		ids, err := connections(ctx, farmer)
		if err != nil {
			log.Printf("connections for %s: %v", farmer, err)
			continue
		}
		if len(ids) == 0 {
			continue
		}
		var bodies [][]byte
		chunk, size := []json.RawMessage{}, 0
		for _, c := range byCollar {
			if size+len(c) > maxMessageBytes && len(chunk) > 0 {
				body, err := json.Marshal(chunk)
				if err != nil {
					return err
				}
				bodies = append(bodies, body)
				chunk, size = []json.RawMessage{}, 0
			}
			chunk = append(chunk, c)
			size += len(c) + 1
		}
		body, err := json.Marshal(chunk)
		if err != nil {
			return err
		}
		bodies = append(bodies, body)

		sent := 0
		for _, id := range ids {
			ok := true
			for _, body := range bodies {
				if !send(ctx, id, body) {
					ok = false
					break
				}
			}
			if ok {
				sent++
			}
		}
		log.Printf("farmer=%s cows=%d messages=%d sent=%d of %d", farmer, len(byCollar), len(bodies), sent, len(ids))
	}
	return nil
}

func connections(ctx context.Context, farmer string) ([]string, error) {
	out, err := db.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		IndexName:              aws.String("farmer_id"),
		KeyConditionExpression: aws.String("farmer_id = :farmer"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":farmer": &types.AttributeValueMemberS{Value: farmer},
		},
	})
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(out.Items))
	for _, item := range out.Items {
		if s, ok := item["connection_id"].(*types.AttributeValueMemberS); ok {
			ids = append(ids, s.Value)
		}
	}
	return ids, nil
}

func send(ctx context.Context, id string, body []byte) bool {
	_, err := gw.PostToConnection(ctx, &apigatewaymanagementapi.PostToConnectionInput{
		ConnectionId: aws.String(id),
		Data:         body,
	})
	if err == nil {
		return true
	}
	var gone *gwtypes.GoneException
	if !errors.As(err, &gone) {
		log.Printf("post to %s: %v", id, err)
		return false
	}
	if _, err := db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(table),
		Key:       map[string]types.AttributeValue{"connection_id": &types.AttributeValueMemberS{Value: id}},
	}); err != nil {
		log.Printf("delete gone %s: %v", id, err)
	}
	return false
}

func unzipJSON(data []byte, v any) error {
	r, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return err
	}
	defer r.Close()
	return json.NewDecoder(r).Decode(v)
}
