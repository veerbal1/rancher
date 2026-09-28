package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Polygon struct {
	Type        string        `json:"type"        dynamodbav:"type"`
	Coordinates [][][]float64 `json:"coordinates" dynamodbav:"coordinates"`
}

type Paddock struct {
	ID        string  `json:"id"         dynamodbav:"id"`
	FarmerID  string  `json:"farmer_id"  dynamodbav:"farmer_id"`
	Name      string  `json:"name"       dynamodbav:"name"`
	Polygon   Polygon `json:"polygon"    dynamodbav:"polygon"`
	AreaHa    float64 `json:"area_ha"    dynamodbav:"area_ha"`
	CreatedAt string  `json:"created_at" dynamodbav:"created_at"`
}

type paddockItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	Paddock
}

func createPaddock(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		Polygon Polygon `json:"polygon"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if msg := validatePolygon(in.Polygon); msg != "" {
		return respond(http.StatusBadRequest, errorBody(msg))
	}

	n, err := nextPaddockNumber(ctx, farmerID)
	var notFound *types.ConditionalCheckFailedException
	if errors.As(err, &notFound) {
		return respond(http.StatusNotFound, errorBody("farmer not found"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}

	p := Paddock{
		ID:        rand.Text(),
		FarmerID:  farmerID,
		Name:      fmt.Sprintf("Paddock #%d", n),
		Polygon:   in.Polygon,
		AreaHa:    areaHa(in.Polygon.Coordinates[0]),
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	item, err := attributevalue.MarshalMap(paddockItem{PK: "FARMER#" + farmerID, SK: "PADDOCK#" + p.ID, Paddock: p})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if _, err := db.PutItem(ctx, &dynamodb.PutItemInput{TableName: aws.String(table), Item: item}); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusCreated, p)
}

func nextPaddockNumber(ctx context.Context, farmerID string) (int, error) {
	out, err := db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			"SK": &types.AttributeValueMemberS{Value: "PROFILE"},
		},
		UpdateExpression:          aws.String("ADD paddock_count :one"),
		ConditionExpression:       aws.String("attribute_exists(PK)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":one": &types.AttributeValueMemberN{Value: "1"}},
		ReturnValues:              types.ReturnValueUpdatedNew,
	})
	if err != nil {
		return 0, err
	}
	var counter struct {
		PaddockCount int `dynamodbav:"paddock_count"`
	}
	if err := attributevalue.UnmarshalMap(out.Attributes, &counter); err != nil {
		return 0, err
	}
	return counter.PaddockCount, nil
}

func listPaddocks(ctx context.Context, farmerID string) (events.APIGatewayV2HTTPResponse, error) {
	paddocks := []Paddock{}
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "PADDOCK#"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		var batch []Paddock
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &batch); err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		paddocks = append(paddocks, batch...)
	}

	sort.Slice(paddocks, func(i, j int) bool {
		if paddocks[i].CreatedAt != paddocks[j].CreatedAt {
			return paddocks[i].CreatedAt < paddocks[j].CreatedAt
		}
		return paddocks[i].Name < paddocks[j].Name
	})
	return respond(http.StatusOK, paddocks)
}

func deletePaddock(ctx context.Context, farmerID, paddockID string) (events.APIGatewayV2HTTPResponse, error) {
	_, err := db.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			"SK": &types.AttributeValueMemberS{Value: "PADDOCK#" + paddockID},
		},
		ConditionExpression: aws.String("attribute_exists(PK)"),
	})
	var notFound *types.ConditionalCheckFailedException
	if errors.As(err, &notFound) {
		return respond(http.StatusNotFound, errorBody("paddock not found"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return events.APIGatewayV2HTTPResponse{StatusCode: http.StatusNoContent}, nil
}

func validatePolygon(p Polygon) string {
	if p.Type != "Polygon" || len(p.Coordinates) != 1 {
		return "polygon must be a GeoJSON Polygon with one ring"
	}
	ring := p.Coordinates[0]
	if len(ring) < 4 || len(ring) > 1000 {
		return "polygon must have 3 to 999 corners"
	}
	for _, pt := range ring {
		if len(pt) != 2 || pt[0] < -180 || pt[0] > 180 || pt[1] < -90 || pt[1] > 90 {
			return "polygon has an invalid coordinate"
		}
	}
	first, last := ring[0], ring[len(ring)-1]
	if first[0] != last[0] || first[1] != last[1] {
		return "polygon ring must be closed"
	}
	return ""
}

func areaHa(ring [][]float64) float64 {
	const metresPerDeg = 111_320.0
	lng0, lat0 := ring[0][0], ring[0][1]
	cosLat := math.Cos(lat0 * math.Pi / 180)

	sum := 0.0
	for i := 0; i < len(ring)-1; i++ {
		x1, y1 := (ring[i][0]-lng0)*metresPerDeg*cosLat, (ring[i][1]-lat0)*metresPerDeg
		x2, y2 := (ring[i+1][0]-lng0)*metresPerDeg*cosLat, (ring[i+1][1]-lat0)*metresPerDeg
		sum += x1*y2 - x2*y1
	}
	return math.Round(math.Abs(sum)/2/10_000*100) / 100
}
