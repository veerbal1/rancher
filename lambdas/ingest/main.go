package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func handle(ctx context.Context, in events.KinesisEvent) error {
	for _, r := range in.Records {
		log.Printf("got: %s", r.Kinesis.Data)
	}
	return nil
}

func main() {
	lambda.Start(handle)
}
