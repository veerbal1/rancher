package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	defaultRacewayWidthM = 5.0
	minRacewayWidthM     = 3.0
	maxRacewayWidthM     = 15.0
)

type Raceway struct {
	ID        string     `json:"id"         dynamodbav:"id"`
	FarmerID  string     `json:"farmer_id"  dynamodbav:"farmer_id"`
	Path      LineString `json:"path"       dynamodbav:"path"`
	WidthM    float64    `json:"width_m"    dynamodbav:"width_m"`
	CreatedAt string     `json:"created_at" dynamodbav:"created_at"`
}

type racewayItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	Raceway
}

func racewayKey(farmerID, racewayID string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
		"SK": &types.AttributeValueMemberS{Value: "RACEWAY#" + racewayID},
	}
}

func createRaceway(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		Path   LineString `json:"path"`
		WidthM float64    `json:"width_m"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if in.Path.Type != "LineString" || len(in.Path.Coordinates) < 2 || len(in.Path.Coordinates) > maxPathPoints {
		return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("path must be a GeoJSON LineString with 2 to %d points", maxPathPoints)))
	}
	for _, pt := range in.Path.Coordinates {
		if len(pt) != 2 || pt[0] < -180 || pt[0] > 180 || pt[1] < -90 || pt[1] > 90 {
			return respond(http.StatusBadRequest, errorBody("path has an invalid coordinate"))
		}
	}
	if in.WidthM == 0 {
		in.WidthM = defaultRacewayWidthM
	}
	if in.WidthM < minRacewayWidthM || in.WidthM > maxRacewayWidthM {
		return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("width_m must be %.0f-%.0f", minRacewayWidthM, maxRacewayWidthM)))
	}

	r := Raceway{ID: rand.Text(), FarmerID: farmerID, Path: in.Path, WidthM: in.WidthM, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	item, err := attributevalue.MarshalMap(racewayItem{PK: "FARMER#" + farmerID, SK: "RACEWAY#" + r.ID, Raceway: r})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if _, err := db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(table), Item: item}); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusCreated, r)
}

func listRaceways(ctx context.Context, farmerID string) (events.APIGatewayV2HTTPResponse, error) {
	raceways, err := queryRaceways(ctx, farmerID)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusOK, raceways)
}

func queryRaceways(ctx context.Context, farmerID string) ([]Raceway, error) {
	raceways := []Raceway{}
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "RACEWAY#"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		var batch []Raceway
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &batch); err != nil {
			return nil, err
		}
		raceways = append(raceways, batch...)
	}
	sort.Slice(raceways, func(i, j int) bool { return raceways[i].CreatedAt < raceways[j].CreatedAt })
	return raceways, nil
}

func deleteRaceway(ctx context.Context, farmerID, racewayID string) (events.APIGatewayV2HTTPResponse, error) {
	_, err := db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName:           aws.String(table),
		Key:                 racewayKey(farmerID, racewayID),
		ConditionExpression: aws.String("attribute_exists(PK)"),
	})
	var notFound *types.ConditionalCheckFailedException
	if errors.As(err, &notFound) {
		return respond(http.StatusNotFound, errorBody("raceway not found"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return events.APIGatewayV2HTTPResponse{StatusCode: http.StatusNoContent}, nil
}
