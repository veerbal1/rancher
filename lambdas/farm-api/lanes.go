package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

type Lane struct {
	FromPaddockID string     `json:"from_paddock_id" dynamodbav:"from_paddock_id"`
	ToPaddockID   string     `json:"to_paddock_id"   dynamodbav:"to_paddock_id"`
	Path          LineString `json:"path"            dynamodbav:"path"`
	WidthM        float64    `json:"width_m"         dynamodbav:"width_m"`
	UpdatedAt     string     `json:"updated_at"      dynamodbav:"updated_at"`
}

type laneItem struct {
	PK string `dynamodbav:"PK"`
	SK string `dynamodbav:"SK"`
	Lane
}

func laneKey(farmerID, from, to string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
		"SK": &types.AttributeValueMemberS{Value: "LANE#" + from + "#" + to},
	}
}

func saveLane(ctx context.Context, farmerID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in Lane
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	if in.FromPaddockID == "" || in.ToPaddockID == "" || in.FromPaddockID == in.ToPaddockID {
		return respond(http.StatusBadRequest, errorBody("from_paddock_id and to_paddock_id must be two different paddocks"))
	}
	if in.WidthM == 0 {
		in.WidthM = defaultLaneWidthM
	}
	if in.WidthM < minLaneWidthM || in.WidthM > maxLaneWidthM {
		return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("width_m must be %.0f-%.0f", minLaneWidthM, maxLaneWidthM)))
	}

	var rings [][][]float64
	for _, id := range []string{in.FromPaddockID, in.ToPaddockID} {
		p, err := getPaddock(ctx, farmerID, id)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		if p == nil {
			return respond(http.StatusNotFound, errorBody("paddock not found"))
		}
		rings = append(rings, p.Polygon.Coordinates[0])
	}
	if msg := validatePath(in.Path, rings[0], rings[1]); msg != "" {
		return respond(http.StatusBadRequest, errorBody(msg))
	}

	in.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	item, err := attributevalue.MarshalMap(laneItem{PK: "FARMER#" + farmerID, SK: "LANE#" + in.FromPaddockID + "#" + in.ToPaddockID, Lane: in})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if _, err := db.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: []types.TransactWriteItem{
		{Put: &types.Put{TableName: aws.String(table), Item: item}},
		{Delete: &types.Delete{TableName: aws.String(table), Key: laneKey(farmerID, in.ToPaddockID, in.FromPaddockID)}},
	}}); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(http.StatusOK, in)
}

func listLanes(ctx context.Context, farmerID string) (events.APIGatewayV2HTTPResponse, error) {
	lanes := []Lane{}
	pages := dynamodb.NewQueryPaginator(db, &dynamodb.QueryInput{
		TableName:              aws.String(table),
		KeyConditionExpression: aws.String("PK = :pk AND begins_with(SK, :prefix)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":pk":     &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			":prefix": &types.AttributeValueMemberS{Value: "LANE#"},
		},
	})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		var batch []Lane
		if err := attributevalue.UnmarshalListOfMaps(page.Items, &batch); err != nil {
			return events.APIGatewayV2HTTPResponse{}, err
		}
		lanes = append(lanes, batch...)
	}
	return respond(http.StatusOK, lanes)
}

func findLane(ctx context.Context, farmerID, from, to string) (*Lane, error) {
	for _, pair := range [][2]string{{from, to}, {to, from}} {
		out, err := db.GetItem(ctx, &dynamodb.GetItemInput{TableName: aws.String(table), Key: laneKey(farmerID, pair[0], pair[1])})
		if err != nil {
			return nil, err
		}
		if out.Item == nil {
			continue
		}
		var lane Lane
		if err := attributevalue.UnmarshalMap(out.Item, &lane); err != nil {
			return nil, err
		}
		if pair[0] != from {
			lane.Path.Coordinates = reversePath(lane.Path.Coordinates)
		}
		return &lane, nil
	}
	return nil, nil
}

func reversePath(pts [][]float64) [][]float64 {
	reversed := make([][]float64, len(pts))
	for i, pt := range pts {
		reversed[len(pts)-1-i] = pt
	}
	return reversed
}
