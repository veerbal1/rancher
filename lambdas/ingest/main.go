package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/valkey-io/valkey-go"
	"github.com/veerbal1/rancher/telemetry"
)

const farmTTLSecs = 60

var (
	cache  valkey.Client
	roster *telemetry.Roster
)

func main() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("aws config: %v", err)
	}
	roster = telemetry.NewRoster(dynamodb.NewFromConfig(cfg), os.Getenv("RANCHER_TABLE"))
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

func handle(ctx context.Context, in events.KinesisEvent) error {
	farms := map[string]map[string]telemetry.Event{}
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
			if e.FarmerID == "" || e.CollarID == "" {
				continue
			}
			if farms[e.FarmerID] == nil {
				farms[e.FarmerID] = map[string]telemetry.Event{}
			}
			farms[e.FarmerID][e.CollarID] = e
		}
	}

	saved := 0
	for farmerID, byCollar := range farms {
		hset := cache.B().Hset().Key("farm:" + farmerID).FieldValue()
		for collarID, e := range byCollar {
			b, err := json.Marshal(e)
			if err != nil {
				return err
			}
			hset = hset.FieldValue(collarID, string(b))
		}
		for _, resp := range cache.DoMulti(ctx,
			hset.Build(),
			cache.B().Expire().Key("farm:"+farmerID).Seconds(farmTTLSecs).Build(),
		) {
			if err := resp.Error(); err != nil {
				return err
			}
		}
		saved += len(byCollar)
	}
	log.Printf("saved %d cows from %d records", saved, len(in.Records))
	return nil
}
