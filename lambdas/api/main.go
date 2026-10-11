package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/valkey-io/valkey-go"
)

type cow struct {
	Time string `json:"time"`
}

const staleAfter = 10 * time.Second

var cache valkey.Client

func main() {
	var err error
	cache, err = valkey.NewClient(valkey.ClientOption{
		InitAddress:  []string{os.Getenv("VALKEY_ADDR")},
		TLSConfig:    &tls.Config{},
		DisableCache: true,
	})
	if err != nil {
		log.Fatalf("valkey: %v", err)
	}
	lambda.Start(handle)
}

func handle(ctx context.Context, req events.LambdaFunctionURLRequest) (events.LambdaFunctionURLResponse, error) {
	farmer := req.QueryStringParameters["farmer"]
	if farmer == "" {
		return events.LambdaFunctionURLResponse{StatusCode: 400, Body: `{"error":"farmer is required"}`}, nil
	}

	all, err := cache.Do(ctx, cache.B().Hgetall().Key("farm:"+farmer).Build()).AsStrMap()
	if err != nil {
		return events.LambdaFunctionURLResponse{}, err
	}
	cows := []json.RawMessage{}
	for _, v := range all {
		var c cow
		if err := json.Unmarshal([]byte(v), &c); err != nil {
			continue
		}
		if t, err := time.Parse(time.RFC3339Nano, c.Time); err == nil && time.Since(t) < staleAfter {
			cows = append(cows, json.RawMessage(v))
		}
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
