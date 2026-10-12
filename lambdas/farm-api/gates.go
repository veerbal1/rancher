package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

const (
	maxGatesPerPaddock = 4
	gateOnFenceM       = 3.0
)

type Gate struct {
	ID   string  `json:"id"   dynamodbav:"id"`
	Name string  `json:"name" dynamodbav:"name"`
	Lng  float64 `json:"lng"  dynamodbav:"lng"`
	Lat  float64 `json:"lat"  dynamodbav:"lat"`
}

func addGate(ctx context.Context, farmerID, paddockID, body string) (events.APIGatewayV2HTTPResponse, error) {
	var in struct {
		Lng float64 `json:"lng"`
		Lat float64 `json:"lat"`
	}
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		return respond(http.StatusBadRequest, errorBody("invalid JSON"))
	}
	p, err := getPaddock(ctx, farmerID, paddockID)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if p == nil {
		return respond(http.StatusNotFound, errorBody("paddock not found"))
	}
	if len(p.Gates) >= maxGatesPerPaddock {
		return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("a paddock can have at most %d gates", maxGatesPerPaddock)))
	}
	if d := distanceToRingM([]float64{in.Lng, in.Lat}, p.Polygon.Coordinates[0]); d > gateOnFenceM {
		return respond(http.StatusBadRequest, errorBody(fmt.Sprintf("a gate must sit on the paddock's fence (this point is %.0f m away)", d)))
	}

	n, err := nextGateNumber(ctx, farmerID)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	gate, err := attributevalue.Marshal([]Gate{{ID: rand.Text(), Name: "Gate " + strconv.Itoa(n), Lng: in.Lng, Lat: in.Lat}})
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	out, err := db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:           aws.String(table),
		Key:                 paddockKey(farmerID, paddockID),
		UpdateExpression:    aws.String("SET gates = list_append(if_not_exists(gates, :empty), :gate)"),
		ConditionExpression: aws.String("attribute_exists(PK)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":gate":  gate,
			":empty": &types.AttributeValueMemberL{Value: []types.AttributeValue{}},
		},
		ReturnValues: types.ReturnValueAllNew,
	})
	return paddockResponse(out, err, http.StatusCreated)
}

func deleteGate(ctx context.Context, farmerID, paddockID, gateID string) (events.APIGatewayV2HTTPResponse, error) {
	p, err := getPaddock(ctx, farmerID, paddockID)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	if p == nil {
		return respond(http.StatusNotFound, errorBody("paddock not found"))
	}
	i := -1
	for j, g := range p.Gates {
		if g.ID == gateID {
			i = j
		}
	}
	if i < 0 {
		return respond(http.StatusNotFound, errorBody("gate not found"))
	}
	out, err := db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName:                 aws.String(table),
		Key:                       paddockKey(farmerID, paddockID),
		UpdateExpression:          aws.String(fmt.Sprintf("REMOVE gates[%d]", i)),
		ConditionExpression:       aws.String(fmt.Sprintf("gates[%d].id = :id", i)),
		ExpressionAttributeValues: map[string]types.AttributeValue{":id": &types.AttributeValueMemberS{Value: gateID}},
		ReturnValues:              types.ReturnValueAllNew,
	})
	return paddockResponse(out, err, http.StatusOK)
}

func paddockKey(farmerID, paddockID string) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
		"SK": &types.AttributeValueMemberS{Value: "PADDOCK#" + paddockID},
	}
}

func paddockResponse(out *dynamodb.UpdateItemOutput, err error, status int) (events.APIGatewayV2HTTPResponse, error) {
	var changed *types.ConditionalCheckFailedException
	if errors.As(err, &changed) {
		return respond(http.StatusConflict, errorBody("the paddock changed, refresh and try again"))
	}
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	var p Paddock
	if err := attributevalue.UnmarshalMap(out.Attributes, &p); err != nil {
		return events.APIGatewayV2HTTPResponse{}, err
	}
	return respond(status, p)
}

func nextGateNumber(ctx context.Context, farmerID string) (int, error) {
	out, err := db.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(table),
		Key: map[string]types.AttributeValue{
			"PK": &types.AttributeValueMemberS{Value: "FARMER#" + farmerID},
			"SK": &types.AttributeValueMemberS{Value: "PROFILE"},
		},
		UpdateExpression:          aws.String("ADD gate_count :one"),
		ConditionExpression:       aws.String("attribute_exists(PK)"),
		ExpressionAttributeValues: map[string]types.AttributeValue{":one": &types.AttributeValueMemberN{Value: "1"}},
		ReturnValues:              types.ReturnValueUpdatedNew,
	})
	if err != nil {
		return 0, err
	}
	var counter struct {
		GateCount int `dynamodbav:"gate_count"`
	}
	if err := attributevalue.UnmarshalMap(out.Attributes, &counter); err != nil {
		return 0, err
	}
	return counter.GateCount, nil
}

func distanceToRingM(pt []float64, ring [][]float64) float64 {
	const metresPerDeg = 111_320.0
	k := metresPerDeg * math.Cos(pt[1]*math.Pi/180)
	px, py := pt[0]*k, pt[1]*metresPerDeg
	best := math.Inf(1)
	for i := 1; i < len(ring); i++ {
		ax, ay := ring[i-1][0]*k, ring[i-1][1]*metresPerDeg
		bx, by := ring[i][0]*k, ring[i][1]*metresPerDeg
		dx, dy := bx-ax, by-ay
		t := 0.0
		if l := dx*dx + dy*dy; l > 0 {
			t = math.Max(0, math.Min(1, ((px-ax)*dx+(py-ay)*dy)/l))
		}
		best = math.Min(best, math.Hypot(ax+t*dx-px, ay+t*dy-py))
	}
	return best
}
